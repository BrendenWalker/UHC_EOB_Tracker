import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createEob, importEob, importEobBatch, parseEobPdfs } from '../api/api';
import { formatCurrency } from '../utils/format';
import './EobNewPage.css';
const emptyLine = () => ({
  service_description: '',
  service_date_start: '',
  service_date_end: '',
  processing_code: '',
  provider_billed: 0,
  amount_saved: 0,
  plan_allowed: 0,
  plan_paid: 0,
  applied_deductible: 0,
  copay: 0,
  coinsurance: 0,
  plan_not_cover: 0,
  amount_owed: 0,
});

const emptyClaim = () => ({
  provider_name: '',
  network_status: 'Network',
  patient_account_number: '',
  claim_number: '',
  lines: [emptyLine()],
});

const emptyStatement = () => ({
  statement_date: '',
  service_period_start: '',
  service_period_end: '',
  member_name: '',
  member_id: '',
  eob_reference: '',
  total_provider_billed: '',
  total_amount_owed: '',
  claims: [emptyClaim()],
});

function EobImportWizard({ onImported }) {
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState(null);

  const handleParse = async () => {
    if (files.length === 0) return;
    try {
      setParsing(true);
      setError(null);
      const response = await parseEobPdfs(files);
      const results = response.data.results || [
        {
          filename: files[0]?.name,
          statement: response.data.statement,
          warnings: response.data.warnings || [],
        },
      ];
      setPreviews(
        results.map((result, index) => ({
          id: `${result.filename}-${index}`,
          filename: result.filename,
          statement: result.statement || null,
          warnings: result.warnings || [],
          error: result.error || null,
          duplicate: result.duplicate || null,
          selected: !result.error && !result.duplicate,
        }))
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to parse PDFs');
      console.error(err);
    } finally {
      setParsing(false);
    }
  };

  const toggleSelected = (id) => {
    setPreviews((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.duplicate) return item;
        return { ...item, selected: !item.selected };
      })
    );
  };

  const handleImport = async () => {
    const toImport = previews.filter((item) => item.selected && item.statement && !item.duplicate);
    if (toImport.length === 0) return;

    try {
      setImporting(true);
      setError(null);

      if (toImport.length === 1) {
        const response = await importEob({ statement: toImport[0].statement });
        onImported([response.data.id]);
        return;
      }

      const response = await importEobBatch(toImport.map((item) => item.statement));
      if (response.data.skipped?.length) {
        setError(
          `Imported ${response.data.eobs.length} EOB(s). Skipped ${response.data.skipped.length} duplicate(s).`
        );
      }
      if (response.data.eobs.length === 0) {
        return;
      }
      onImported(response.data.eobs.map((eob) => eob.id));
    } catch (err) {
      if (err.response?.status === 409) {
        const dup = err.response.data.duplicate;
        setError(
          dup?.existing_eob_id
            ? `Duplicate EOB — already imported (statement ${dup.existing_statement_date || 'on file'}).`
            : err.response.data.error || 'Duplicate EOB'
        );
      } else {
        setError(err.response?.data?.error || 'Failed to import EOBs');
      }
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = previews.filter((item) => item.selected && item.statement && !item.duplicate).length;
  const parsedCount = previews.filter((item) => item.statement).length;
  const duplicateCount = previews.filter((item) => item.duplicate).length;

  return (
    <div className="import-wizard">
      <label className="file-field">
        <span>UHC EOB PDFs</span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => {
            setFiles(Array.from(e.target.files || []));
            setPreviews([]);
            setError(null);
          }}
        />
        {files.length > 0 && (
          <span className="file-count">{files.length} file{files.length === 1 ? '' : 's'} selected</span>
        )}
      </label>

      <div className="actions">
        <button type="button" onClick={handleParse} disabled={files.length === 0 || parsing}>
          {parsing ? 'Parsing...' : `Parse PDF${files.length === 1 ? '' : 's'}`}
        </button>
        {previews.length > 0 && (
          <button
            type="button"
            className="btn-primary"
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
          >
            {importing
              ? 'Importing...'
              : `Import ${selectedCount} EOB${selectedCount === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {error && <p className="error-inline">{error}</p>}

      {previews.length > 0 && (
        <p className="section-hint">
          {parsedCount} of {previews.length} parsed successfully.
          {duplicateCount > 0 ? ` ${duplicateCount} duplicate(s) blocked from import.` : ''}
          {' '}Uncheck any you do not want to import.
        </p>
      )}

      {previews.map((item) => (
        <div
          key={item.id}
          className={`preview-box ${item.error ? 'preview-error' : ''} ${item.duplicate ? 'preview-duplicate' : ''}`}
        >
          <div className="preview-header">
            {item.statement ? (
              <label className="preview-select">
                <input
                  type="checkbox"
                  checked={item.selected}
                  disabled={Boolean(item.duplicate)}
                  onChange={() => toggleSelected(item.id)}
                />
                <strong>{item.filename}</strong>
              </label>
            ) : (
              <strong>{item.filename}</strong>
            )}
          </div>

          {item.duplicate && (
            <p className="duplicate-notice">
              {item.duplicate.type === 'database' ? (
                <>
                  Already imported —{' '}
                  <Link to={`/eobs/${item.duplicate.existing_eob_id}`}>view existing EOB</Link>
                </>
              ) : (
                <>Duplicate of {item.duplicate.duplicate_of_filename} in this upload</>
              )}
            </p>
          )}

          {item.error && <p className="error-inline">{item.error}</p>}

          {item.statement && (
            <>
              <p>
                {item.statement.member_name} · {item.statement.claims?.length || 0} claims ·{' '}
                {formatCurrency(item.statement.total_amount_owed)}
              </p>
              <ul className="preview-claims">
                {item.statement.claims?.map((claim, idx) => {
                  const owed = (claim.lines || []).reduce((s, l) => s + Number(l.amount_owed || 0), 0);
                  return (
                    <li key={`${claim.claim_number}-${idx}`}>
                      {claim.provider_name} ({claim.claim_number}) — {claim.lines?.length || 0} lines,{' '}
                      {formatCurrency(owed)} owed
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {item.warnings.length > 0 && (
            <div className="warnings-box">
              <strong>Parser warnings</strong>
              <ul>
                {item.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function ManualEobForm({ onCreated }) {
  const [form, setForm] = useState(emptyStatement());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const updateStatement = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateClaim = (claimIndex, field, value) => {
    setForm((prev) => {
      const claims = [...prev.claims];
      claims[claimIndex] = { ...claims[claimIndex], [field]: value };
      return { ...prev, claims };
    });
  };

  const updateLine = (claimIndex, lineIndex, field, value) => {
    setForm((prev) => {
      const claims = [...prev.claims];
      const lines = [...claims[claimIndex].lines];
      lines[lineIndex] = {
        ...lines[lineIndex],
        [field]: field.includes('amount') || field.includes('billed') || field.includes('owed') || field.includes('paid') || field.includes('copay') || field.includes('deductible') || field.includes('coinsurance') || field.includes('cover') || field.includes('saved') || field.includes('allowed')
          ? Number(value) || 0
          : value,
      };
      claims[claimIndex] = { ...claims[claimIndex], lines };
      return { ...prev, claims };
    });
  };

  const addClaim = () => {
    setForm((prev) => ({ ...prev, claims: [...prev.claims, emptyClaim()] }));
  };

  const addLine = (claimIndex) => {
    setForm((prev) => {
      const claims = [...prev.claims];
      claims[claimIndex] = {
        ...claims[claimIndex],
        lines: [...claims[claimIndex].lines, emptyLine()],
      };
      return { ...prev, claims };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const payload = {
        ...form,
        total_provider_billed: form.total_provider_billed === '' ? null : Number(form.total_provider_billed),
        total_amount_owed: form.total_amount_owed === '' ? null : Number(form.total_amount_owed),
      };
      const response = await createEob(payload);
      onCreated(response.data.id);
    } catch (err) {
      if (err.response?.status === 409) {
        const dup = err.response.data.duplicate;
        setError(
          dup?.existing_eob_id
            ? `Duplicate EOB — already on file.`
            : err.response.data.error || 'Duplicate EOB'
        );
      } else {
        setError(err.response?.data?.error || 'Failed to create EOB');
      }
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="manual-form" onSubmit={handleSubmit}>
      <section className="panel">
        <h2>Statement</h2>
        <div className="form-grid">
          <label>
            Statement date
            <input type="date" value={form.statement_date} onChange={(e) => updateStatement('statement_date', e.target.value)} />
          </label>
          <label>
            Service period start
            <input type="date" value={form.service_period_start} onChange={(e) => updateStatement('service_period_start', e.target.value)} />
          </label>
          <label>
            Service period end
            <input type="date" value={form.service_period_end} onChange={(e) => updateStatement('service_period_end', e.target.value)} />
          </label>
          <label>
            Member name
            <input value={form.member_name} onChange={(e) => updateStatement('member_name', e.target.value)} />
          </label>
          <label>
            Member ID
            <input value={form.member_id} onChange={(e) => updateStatement('member_id', e.target.value)} />
          </label>
          <label>
            EOB reference
            <input value={form.eob_reference} onChange={(e) => updateStatement('eob_reference', e.target.value)} />
          </label>
          <label>
            Provider billed
            <input type="number" step="0.01" value={form.total_provider_billed} onChange={(e) => updateStatement('total_provider_billed', e.target.value)} />
          </label>
          <label>
            Total you owe
            <input type="number" step="0.01" value={form.total_amount_owed} onChange={(e) => updateStatement('total_amount_owed', e.target.value)} />
          </label>
        </div>
      </section>

      {form.claims.map((claim, claimIndex) => (
        <section className="panel" key={`claim-${claimIndex}`}>
          <h2>Claim {claimIndex + 1}</h2>
          <div className="form-grid">
            <label>
              Provider name *
              <input required value={claim.provider_name} onChange={(e) => updateClaim(claimIndex, 'provider_name', e.target.value)} />
            </label>
            <label>
              Network status
              <input value={claim.network_status} onChange={(e) => updateClaim(claimIndex, 'network_status', e.target.value)} />
            </label>
            <label>
              Patient account #
              <input value={claim.patient_account_number} onChange={(e) => updateClaim(claimIndex, 'patient_account_number', e.target.value)} />
            </label>
            <label>
              Claim number
              <input value={claim.claim_number} onChange={(e) => updateClaim(claimIndex, 'claim_number', e.target.value)} />
            </label>
          </div>

          <h3>Service lines</h3>
          {claim.lines.map((line, lineIndex) => (
            <div className="line-block" key={`line-${claimIndex}-${lineIndex}`}>
              <div className="form-grid">
                <label>
                  Description *
                  <input required value={line.service_description} onChange={(e) => updateLine(claimIndex, lineIndex, 'service_description', e.target.value)} />
                </label>
                <label>
                  Service date
                  <input type="date" value={line.service_date_start} onChange={(e) => updateLine(claimIndex, lineIndex, 'service_date_start', e.target.value)} />
                </label>
                <label>
                  End date
                  <input type="date" value={line.service_date_end} onChange={(e) => updateLine(claimIndex, lineIndex, 'service_date_end', e.target.value)} />
                </label>
                <label>
                  Code
                  <input value={line.processing_code} onChange={(e) => updateLine(claimIndex, lineIndex, 'processing_code', e.target.value)} />
                </label>
                <label>
                  Provider billed
                  <input type="number" step="0.01" value={line.provider_billed} onChange={(e) => updateLine(claimIndex, lineIndex, 'provider_billed', e.target.value)} />
                </label>
                <label>
                  Amount you owe
                  <input type="number" step="0.01" value={line.amount_owed} onChange={(e) => updateLine(claimIndex, lineIndex, 'amount_owed', e.target.value)} />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => addLine(claimIndex)}>
            Add line
          </button>
        </section>
      ))}

      <div className="actions">
        <button type="button" className="btn-secondary" onClick={addClaim}>
          Add claim
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Create EOB'}
        </button>
      </div>
      {error && <p className="error-inline">{error}</p>}
    </form>
  );
}

export default function EobNewPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('pdf');

  const handleCreated = (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 1) {
      navigate(`/eobs/${idList[0]}`);
    } else {
      navigate('/eobs');
    }
  };
  return (
    <div className="eob-new-page page-scroll">
      <div className="breadcrumb">
        <Link to="/eobs">EOB Statements</Link>
        <span> / Add</span>
      </div>

      <header className="page-header">
        <h1>Add EOB</h1>
        <p>Upload one or more UHC PDFs, or enter claim details manually.</p>
      </header>
      <div className="tabs">
        <button type="button" className={tab === 'pdf' ? 'active' : ''} onClick={() => setTab('pdf')}>
          Upload PDF
        </button>
        <button type="button" className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>
          Manual entry
        </button>
      </div>

      {tab === 'pdf' ? (
        <EobImportWizard onImported={handleCreated} />
      ) : (
        <ManualEobForm onCreated={handleCreated} />
      )}
    </div>
  );
}

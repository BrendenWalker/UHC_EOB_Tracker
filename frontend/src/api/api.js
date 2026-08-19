import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getDashboard = () => api.get('/dashboard');
export const getEobs = () => api.get('/eobs');
export const getEob = (id) => api.get(`/eobs/${id}`);
export const createEob = (data) => api.post('/eobs', data);
export const importEob = (data) => api.post('/eobs/import', data);
export const importEobBatch = (statements) => api.post('/eobs/import-batch', { statements });
export const updateEob = (id, data) => api.put(`/eobs/${id}`, data);
export const deleteEob = (id) => api.delete(`/eobs/${id}`);
export const parseEobPdfs = (files) => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  return api.post('/eobs/parse-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
/** @deprecated use parseEobPdfs */
export const parseEobPdf = (file) => parseEobPdfs([file]);

export const getClaim = (id) => api.get(`/claims/${id}`);
export const updateClaim = (id, data) => api.patch(`/claims/${id}`, data);
export const updateClaimLine = (claimId, lineId, data) =>
  api.put(`/claims/${claimId}/lines/${lineId}`, data);
export const createClaimLine = (claimId, data) =>
  api.post(`/claims/${claimId}/lines`, data);

export default api;

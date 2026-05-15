import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const response = await fetch("https://employer.tangerino.com.br/employee/find-all?page=0&size=300", {
    headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH },
  });

  const raw = await response.json();

  // Retorna estrutura da resposta (sem dados sensíveis completos)
  const isArray = Array.isArray(raw);
  const keys = isArray ? [] : Object.keys(raw);
  const sample = isArray ? { length: raw.length, first: raw[0] ? Object.keys(raw[0]) : [] } : {
    keys,
    totalElements: raw.totalElements,
    totalPages: raw.totalPages,
    number: raw.number,
    size: raw.size,
    last: raw.last,
    contentLength: (raw.content || []).length,
    firstItemKeys: raw.content?.[0] ? Object.keys(raw.content[0]) : [],
  };

  return Response.json({ isArray, sample, status: response.status });
});
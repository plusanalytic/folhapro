import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Chama a função de sincronização de cargos já existente via SDK
    const result = await base44.asServiceRole.functions.invoke('syncJobRoles', {});

    return Response.json({ success: true, result: result?.data ?? result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
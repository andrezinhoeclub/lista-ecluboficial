// ==========================================================
// E-Club 2.0 — Edge Function "gerenciar-acesso"
//
// Por que isso precisa ser uma function separada (e não só o app
// chamando o Supabase direto): criar um usuário novo (e-mail/senha)
// exige a "service role key" — a chave mestra do projeto, que NUNCA
// pode rodar no navegador (quem tivesse ela teria acesso total ao
// banco). Essa função roda só no servidor do Supabase, usa essa
// chave só ali dentro, e o navegador do master só conversa com ela.
//
// Como publicar (pelo próprio site do Supabase, sem precisar instalar
// nada no computador, e sem precisar configurar nenhum secret manual):
// 1. No Supabase: menu lateral > Edge Functions > abre a function
//    gerenciar-acesso (ou cria nova, se ainda não existir)
// 2. Apague o código atual e cole o conteúdo deste arquivo
// 3. Deploy
//
// Esse projeto usa o sistema novo de chaves do Supabase
// (sb_publishable_.../sb_secret_...), onde as variáveis automáticas
// antigas (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) vêm
// desativadas — em vez delas, o Supabase injeta
// SUPABASE_PUBLISHABLE_KEYS e SUPABASE_SECRET_KEYS, cada uma como um
// "dicionário" (JSON) com a(s) chave(s) de verdade dentro. As funções
// abaixo leem esse formato novo primeiro e, se não existir, caem pro
// formato antigo — funciona nos dois tipos de projeto.
// ==========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function primeiraChaveDoDicionario(nomeVarNova: string, nomeVarAntiga: string): string {
  const bruto = Deno.env.get(nomeVarNova);
  if (bruto) {
    try {
      const dicionario = JSON.parse(bruto) as Record<string, string>;
      const valores = Object.values(dicionario);
      if (valores.length) return valores[0];
    } catch (_) { /* formato inesperado, cai pro fallback abaixo */ }
  }
  return Deno.env.get(nomeVarAntiga) || "";
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = primeiraChaveDoDicionario("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = primeiraChaveDoDicionario("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      // CORS: libera chamadas vindas do abreaporta.com.br (e do teste local)
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Não autenticado." }, 401);

    // Cliente "como o usuário que chamou", só pra descobrir quem é.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sessão inválida." }, 401);

    // Cliente "admin", com a chave mestra — só usado aqui dentro do servidor.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Confirma que quem chamou é master ativo.
    const { data: meuAcesso, error: erroConsulta } = await admin
      .from("acessos")
      .select("is_master, ativo")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!meuAcesso?.is_master || !meuAcesso?.ativo) {
      // DIAGNÓSTICO TEMPORÁRIO — remover depois de resolver o problema de
      // permissão. Isso devolve, dentro do próprio erro, exatamente o que a
      // function enxergou, pra conseguirmos ver pelo Network tab do navegador.
      return json({
        error: "Só o master pode gerenciar acessos.",
        debug: {
          caller_user_id: userData.user.id,
          caller_email: userData.user.email,
          acesso_encontrado: meuAcesso,
          erro_na_consulta: erroConsulta?.message || null,
          tem_service_role_key: !!SERVICE_ROLE_KEY,
        },
      }, 403);
    }

    const body = await req.json();
    const { action } = body;

    if (action === "listar") {
      const { data, error } = await admin
        .from("acessos")
        .select("user_id, nome, ativo, is_master, pode_portaria, pode_promoter, promoter_tipo, pode_solteiras, pode_vallet, pode_caronas, criado_em")
        .order("nome");
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, acessos: data });
    }

    if (action === "criar_ou_atualizar") {
      const {
        email, nome, user_id_edicao,
        is_master, pode_portaria, pode_promoter, promoter_tipo,
        pode_solteiras, pode_vallet, pode_caronas,
      } = body;

      if (!nome || !String(nome).trim()) return json({ error: "Informe o nome." }, 400);

      let targetUserId = user_id_edicao || null;

      if (!targetUserId) {
        if (!email) return json({ error: "Informe o e-mail." }, 400);
        // Cria o usuário no Auth e manda um e-mail com o link pra ele
        // definir a própria senha — a senha nunca passa pelo dashboard.
        // O redirectTo manda esse link cair direto na nossa página de
        // "definir senha" (precisa estar na lista de Redirect URLs do
        // Supabase: Authentication > URL Configuration).
        const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: "https://abreaporta.com.br/definir-senha-nova.html",
        });
        if (inviteErr) return json({ error: inviteErr.message }, 400);
        targetUserId = invited.user.id;
      }

      const { error: upsertErr } = await admin.from("acessos").upsert({
        user_id: targetUserId,
        nome: String(nome).trim(),
        ativo: true,
        is_master: !!is_master,
        pode_portaria: !!pode_portaria,
        pode_promoter: !!pode_promoter,
        promoter_tipo: pode_promoter ? (promoter_tipo || "padrao") : null,
        pode_solteiras: !!pode_solteiras,
        pode_vallet: !!pode_vallet,
        pode_caronas: !!pode_caronas,
      });
      if (upsertErr) return json({ error: upsertErr.message }, 400);

      return json({ ok: true, user_id: targetUserId });
    }

    if (action === "desativar") {
      const { user_id_edicao } = body;
      if (!user_id_edicao) return json({ error: "Falta o usuário." }, 400);
      const { error } = await admin.from("acessos").update({ ativo: false }).eq("user_id", user_id_edicao);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "reativar") {
      const { user_id_edicao } = body;
      if (!user_id_edicao) return json({ error: "Falta o usuário." }, 400);
      const { error } = await admin.from("acessos").update({ ativo: true }).eq("user_id", user_id_edicao);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "excluir") {
      const { user_id_edicao } = body;
      if (!user_id_edicao) return json({ error: "Falta o usuário." }, 400);
      if (user_id_edicao === userData.user.id) {
        return json({ error: "Você não pode excluir a própria conta enquanto está logado com ela." }, 400);
      }
      // Apaga da tabela de acessos e também a conta de login (Auth) —
      // é exclusão de verdade, não dá pra desfazer.
      await admin.from("acessos").delete().eq("user_id", user_id_edicao);
      const { error } = await admin.auth.admin.deleteUser(user_id_edicao);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "reenviar_convite") {
      // Útil pra contas criadas antes desse ajuste (o link antigo não levava
      // pra página de definir senha), ou quando a pessoa simplesmente não
      // recebeu o e-mail e quer tentar de novo.
      const { user_id_edicao } = body;
      if (!user_id_edicao) return json({ error: "Falta o usuário." }, 400);
      const { data: userInfo, error: getUserErr } = await admin.auth.admin.getUserById(user_id_edicao);
      if (getUserErr || !userInfo?.user?.email) return json({ error: "Não achei o e-mail dessa conta." }, 400);
      const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(userInfo.user.email, {
        redirectTo: "https://abreaporta.com.br/definir-senha-nova.html",
      });
      if (inviteErr) return json({ error: inviteErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "definir_senha") {
      // Define a senha diretamente, sem depender do e-mail de convite — útil
      // quando o e-mail não chega (serviço de e-mail padrão do Supabase tem
      // limite e pode falhar sem um SMTP próprio configurado).
      const { user_id_edicao, nova_senha } = body;
      if (!user_id_edicao) return json({ error: "Falta o usuário." }, 400);
      if (!nova_senha || String(nova_senha).length < 6) {
        return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id_edicao, { password: nova_senha });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

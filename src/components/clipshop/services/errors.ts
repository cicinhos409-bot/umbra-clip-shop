export type ClipShopErrorCode =
  | "FILE_TOO_LARGE" | "STORAGE_INSUFFICIENT" | "CODEC_INCOMPATIBLE"
  | "AUDIO_MISSING" | "WEBCODECS_UNAVAILABLE" | "LOCAL_FILE_MISSING"
  | "PROJECT_CORRUPTED" | "BALANCE_INSUFFICIENT" | "TEMPORARY_FAILURE"
  | "PERMANENT_FAILURE";

export interface ClipShopErrorInfo { code: ClipShopErrorCode; title: string; message: string; recoverable: boolean }

export function classifyClipShopError(cause: unknown): ClipShopErrorInfo {
  const raw = cause instanceof Error ? cause.message : String(cause || "");
  const text = raw.toLowerCase();
  if (text.includes("500 mb") || text.includes("grande demais")) return info("FILE_TOO_LARGE", "Arquivo grande demais", raw, false);
  if (text.includes("espaço") || text.includes("quota") || text.includes("storage")) return info("STORAGE_INSUFFICIENT", "Espaço insuficiente", raw, true);
  if (text.includes("webcodecs")) return info("WEBCODECS_UNAVAILABLE", "Navegador sem WebCodecs", raw, false);
  if (text.includes("saldo") || text.includes("monthly_limit") || text.includes("limit_reached")) return info("BALANCE_INSUFFICIENT", "Saldo insuficiente para o lote", raw, false);
  if (text.includes("não foi encontrado") || text.includes("missing") || text.includes("removido")) return info("LOCAL_FILE_MISSING", "Arquivo local removido", raw, false);
  if (text.includes("áudio") || text.includes("audio track")) return info("AUDIO_MISSING", "Faixa de áudio ausente", raw, true);
  if (text.includes("codec") || text.includes("decode") || text.includes("encode")) return info("CODEC_INCOMPATIBLE", "Codec incompatível", raw, false);
  if (text.includes("corromp")) return info("PROJECT_CORRUPTED", "Projeto corrompido", raw, false);
  if (text.includes("network") || text.includes("timeout") || text.includes("tempor") || text.includes("abort")) return info("TEMPORARY_FAILURE", "Falha temporária recuperável", raw, true);
  return info("PERMANENT_FAILURE", "Falha definitiva", raw || "Não foi possível concluir esta operação.", false);
}

function info(code: ClipShopErrorCode, title: string, raw: string, recoverable: boolean): ClipShopErrorInfo {
  return { code, title, message: raw || title, recoverable };
}

import { classifyClipShopError } from "./errors";

describe("classifyClipShopError", () => {
  it.each([
    ["Arquivo excede 500 MB", "FILE_TOO_LARGE", false],
    ["WebCodecs indisponível", "WEBCODECS_UNAVAILABLE", false],
    ["storage quota exceeded", "STORAGE_INSUFFICIENT", true],
    ["CLIP_SHOP_MONTHLY_LIMIT_REACHED", "BALANCE_INSUFFICIENT", false],
    ["network timeout", "TEMPORARY_FAILURE", true],
  ])("classifica %s", (message, code, recoverable) => {
    expect(classifyClipShopError(new Error(message))).toMatchObject({ code, recoverable });
  });
});

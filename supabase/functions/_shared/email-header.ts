export const EMAIL_LOGO_URL = "https://pipingbox.com/assets/logos/logo-horizontal-email.png";

export function renderEmailLogo(): string {
  return `<img src="${EMAIL_LOGO_URL}" alt="PIPINGBOX" width="260" height="96" style="display:block;width:260px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:18px;" />`;
}

export function renderEmailHeader(placement: "row" | "block" = "row"): string {
  const content = renderEmailLogo();
  if (placement === "block") {
    return `<div role="banner" style="background-color:#0B0B0B;padding:20px 24px;">${content}</div>`;
  }
  return `<tr><td align="left" bgcolor="#0B0B0B" style="background-color:#0B0B0B;padding:20px 28px;">${content}</td></tr>`;
}

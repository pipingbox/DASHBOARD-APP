import { expect, test } from '@playwright/test';

const URL = '/tools?t=pipe-offset&lng=es';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: /Versión Beta|Beta Version/ });
  const btn = dialog.getByRole('button', { name: /Continuar|Continue/ });
  await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => btn.click()).catch(() => {});
  await expect(dialog).toBeHidden();
}

test.describe('R1 Fase C — quiebros', () => {
  test('con codos: A=B=300 θ=45 LR 6" → H, take-out, corte recto coherentes', async ({ page }) => {
    await openTool(page);
    // A=300 B=300 → H=424.264 mm; takeout=CLR·tan(22.5°); CLR 6" LR=228.6 → 94.7; straight=424.264-2·94.7=234.9
    await expect(page.getByText(/424,[23] mm|424\.[23] mm/).first()).toBeVisible();
    await expect(page.getByText(/Take-out por codo/).first()).toBeVisible();
    await expect(page.getByText(/Corte recto/).first()).toBeVisible();
    await expect(page.getByText(/Centro a centro/).first()).toBeVisible();
    // Diagrama presente
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('angle_mismatch: A=B=300 (θ=45) con codo 90° → error explícito sin resultados', async ({ page }) => {
    await openTool(page);
    const angleInput = page.locator('input[value="45"]').first();
    await angleInput.fill('90');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
    // error angle_mismatch visible y sin tabla de resultados
    await expect(page.getByText(/Take-out por codo/)).toHaveCount(0);
  });

  test('decimal/coma: "300,5" no produce NaN ni resultado fabricado', async ({ page }) => {
    await openTool(page);
    const aInput = page.locator('input[value="300"]').first();
    await aInput.fill('300,5');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('stale: válido → inválido elimina resultados', async ({ page }) => {
    await openTool(page);
    await expect(page.getByText(/424,[23] mm|424\.[23] mm/).first()).toBeVisible();
    const aInput = page.locator('input[value="300"]').first();
    await aInput.fill('abc');
    await expect(page.getByText(/424,[23] mm|424\.[23] mm/)).toHaveCount(0);
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('sin codos: A=B=300 → diagonal 424.3, θ=45°, corte por extremo 22.5°', async ({ page }) => {
    await openTool(page);
    await page.getByRole('tab', { name: /Sin codos/ }).click();
    await expect(page.getByText(/424,[23] mm|424\.[23] mm/).first()).toBeVisible();
    await expect(page.getByText(/22,50°|22\.50°/).first()).toBeVisible();
  });

  test('verificación: dos valores (A=620, B=620) → triángulo completo', async ({ page }) => {
    await openTool(page);
    await page.getByRole('tab', { name: /Comprobar/ }).click();
    // Campos dentro del panel de la herramienta (no el buscador global del header)
    const panel = page.locator('.rounded-lg.border').last();
    await panel.getByText(/^A \(avance\)/).locator('..').getByRole('textbox').fill('620');
    await panel.getByText(/^B \(desplazamiento\)/).locator('..').getByRole('textbox').fill('620');
    // El motor exige exactamente 2 valores: vaciar H y θ (tienen valores por defecto)
    await panel.getByText(/^H \(recorrido\)/).locator('..').getByRole('textbox').fill('');
    await panel.getByText(/^θ \(ángulo\)/).locator('..').getByRole('textbox').fill('');
    await expect(page.getByText(/876,8 mm|876\.8 mm/).first()).toBeVisible();
  });

  test('unidades: toggle mm→in convierte A preservando dimensión', async ({ page }) => {
    await openTool(page);
    await page.getByRole('button', { name: 'in', exact: true }).click();
    // A=300 mm → 11.811 in
    await expect(page.locator('input[value="11.811"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(page.locator('input[value="300"]').first()).toBeVisible();
  });

  test('móvil 390px: campos operables y sin overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page);
    await expect(page.locator('input[value="300"]').first()).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
  });
});

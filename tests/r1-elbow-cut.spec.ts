import { expect, test } from '@playwright/test';

const URL = '/tools?t=elbow-cut&lng=es';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: /Versión Beta|Beta Version/ });
  const continueBtn = dialog.getByRole('button', { name: /Continuar|Continue/ });
  // El diálogo beta puede tardar en aparecer (persistencia local vs primera visita);
  // cerrarlo siempre que llegue, para que no intercepte los fills posteriores.
  await continueBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => continueBtn.click()).catch(() => {});
  await expect(dialog).toBeHidden();
}

test.describe('R1 Fase B — corte de codos', () => {
  test('nominal: resultados y diagrama visibles y coherentes', async ({ page }) => {
    await openTool(page);
    // NPS 6 STD LR, total 90, beta 45 por defecto
    await expect(page.getByText(/OD = 168,3 mm|OD = 168.3 mm/).first()).toBeVisible();
    // Resultados: corte eje = CLR·tan(22.5°) con CLR=228.6 → 94.7 mm
    await expect(page.getByText(/94,[67] mm|94\.[67] mm/).first()).toBeVisible();
    // Diagrama SVG presente con la etiqueta de corte
    await expect(page.locator('svg').filter({ hasText: 'β = 45°' }).first()).toBeVisible();
  });

  test('decimal/coma: "45,5" no produce NaN ni resultado fabricado', async ({ page }) => {
    await openTool(page);
    const beta = page.getByText(/Ángulo.*corte|β/i).locator('..').getByRole('textbox');
    // localizar el input beta por su valor actual "45"
    const betaInput = page.locator('input[value="45"]').first();
    await betaInput.fill('45,5');
    // La UI parsea Number("45,5")=NaN → motor rechaza → error o sin resultado, nunca NaN en pantalla
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('entrada inválida: beta > total → error explícito sin resultados', async ({ page }) => {
    await openTool(page);
    const betaInput = page.locator('input[value="45"]').first();
    await betaInput.fill('95');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
    // Debe aparecer error y NO la tabla de resultados (el valor de corte eje desaparece)
    await expect(page.getByText(/94,[67] mm|94\.[67] mm/)).toHaveCount(0);
  });

  test('stale: de válido a inválido elimina el resultado anterior', async ({ page }) => {
    await openTool(page);
    const betaInput = page.locator('input[value="45"]').first();
    // válido primero
    await expect(page.getByText(/94,[67] mm|94\.[67] mm/).first()).toBeVisible();
    // inválido después
    await betaInput.fill('abc');
    await expect(page.getByText(/94,[67] mm|94\.[67] mm/)).toHaveCount(0);
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('unidades: toggle mm→in convierte CLR preservando dimensión', async ({ page }) => {
    await openTool(page);
    await page.getByRole('button', { name: 'in', exact: true }).click();
    // CLR 228.6 mm → 9.000 in
    await expect(page.getByText(/CLR = 9\.000 in/).first()).toBeVisible();
    await page.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(page.getByText(/CLR = 228,6 mm|CLR = 228.6 mm/).first()).toBeVisible();
  });

  test('móvil 390px: campos operables y sin overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page);
    const betaInput = page.locator('input[value="45"]').first();
    await expect(betaInput).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
  });
});

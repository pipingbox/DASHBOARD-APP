import { expect, test } from '@playwright/test';

const URL = '/tools?t=pipe-comb&lng=es';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: /Versión Beta|Beta Version/ });
  const btn = dialog.getByRole('button', { name: /Continuar|Continue/ });
  await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => btn.click()).catch(() => {});
  await expect(dialog).toBeHidden();
}

test.describe('R1 Fase D — peines', () => {
  test('nominal: tabla por línea con offsets anclados a línea 1 y diagrama', async ({ page }) => {
    await openTool(page);
    // Por defecto: 4 líneas, 200→400, 45°, CLR 152.4 (6" LR)
    // Diagrama SVG presente con etiquetas L1..L4
    await expect(page.locator('svg').first()).toBeVisible();
    // Tabla con columnas Línea/Quiebro/Avance/Recorrido/Corte recto/Dif.
    await expect(page.getByText('Quiebro').first()).toBeVisible();
    await expect(page.getByText('Avance').first()).toBeVisible();
    await expect(page.getByText('Recorrido').first()).toBeVisible();
    await expect(page.getByText('Corte recto').first()).toBeVisible();
  });

  test('línea de referencia: L1 recta (offset 0, sin codos)', async ({ page }) => {
    await openTool(page);
    // La fila de la línea 1 (primera de la tabla) debe tener quiebro 0 y avance/recorrido 0
    const row1 = page.locator('tbody tr').first();
    await expect(row1).toBeVisible();
    await expect(row1.getByText(/0,0 mm|0\.0 mm/).first()).toBeVisible();
  });

  test('decimal/coma: "200,5" no produce NaN ni resultado fabricado', async ({ page }) => {
    await openTool(page);
    const spacingInput = page.locator('input[value="200"]').first();
    await spacingInput.fill('200,5');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('inválido: separación negativa → error o sin resultados, sin NaN', async ({ page }) => {
    await openTool(page);
    const spacingInput = page.locator('input[value="200"]').first();
    await spacingInput.fill('-50');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('stale: válido → inválido elimina resultados', async ({ page }) => {
    await openTool(page);
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    const spacingInput = page.locator('input[value="200"]').first();
    await spacingInput.fill('abc');
    await expect(page.locator("tbody tr")).toHaveCount(0);
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('unidades: toggle mm→in convierte separación preservando dimensión', async ({ page }) => {
    await openTool(page);
    await page.getByRole('button', { name: 'in', exact: true }).click();
    // 200 mm → 7.874 in
    await expect(page.locator('input[value="7.874"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(page.locator('input[value="200"]').first()).toBeVisible();
  });

  test('móvil 390px: campos operables y sin overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page);
    await expect(page.locator('input[value="200"]').first()).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
  });
});

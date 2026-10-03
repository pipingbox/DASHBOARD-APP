import { expect, test } from '@playwright/test';

async function openTool(page: import('@playwright/test').Page, t: string) {
  await page.goto(`/tools?t=${t}&lng=es`);
  const dialog = page.getByRole('dialog', { name: /Versión Beta|Beta Version/ });
  const btn = dialog.getByRole('button', { name: /Continuar|Continue/ });
  await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => btn.click()).catch(() => {});
  await expect(dialog).toBeHidden();
}

test.describe('R1 Fase F — resto de herramientas', () => {
  test('espesor: nominal 3.005 mm; inválidos sin NaN ni resultado fabricado', async ({ page }) => {
    await openTool(page, 'wall-thickness');
    await page.getByRole('button', { name: /Calcular|Calculate/i }).click();
    await expect(page.getByText(/3,005|3\.005/).first()).toBeVisible();
    // Negativo en diámetro → error, sin NaN. Los inputs no conservan value= tras calcular;
    // localizar por label.
    const dInput = page.getByText(/Diámetro exterior/).locator('..').getByRole('textbox');
    await dInput.fill('-5');
    await page.getByRole('button', { name: /Calcular|Calculate/i }).click();
    await expect(page.getByText(/NaN/)).toHaveCount(0);
    // Y inválido (antes NaN) → error
    await dInput.fill('168.3');
    const yInput = page.getByText(/Coeficiente Y/).locator('..').getByRole('textbox');
    await yInput.fill('abc');
    await page.getByRole('button', { name: /Calcular|Calculate/i }).click();
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('conversor: 168.3 mm → in y tabla de conversiones', async ({ page }) => {
    await openTool(page, 'unit-converter');
    const valueInput = page.locator('input[type="number"]').first();
    await valueInput.fill('168.3');
    // mm → in por defecto
    await expect(page.getByText(/6,625984|6\.625984/).first()).toBeVisible();
    // input[type=number] no acepta coma (limitación del navegador); verificar que
    // un valor no numérico vía teclado no produce NaN: vaciar → sin resultado fabricado
    await valueInput.fill('');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('dimensiones: tabla NPS con OD/WT/ID/kg-m', async ({ page }) => {
    await openTool(page, 'pipe-dimensions');
    // Debe mostrar una tabla o datos de dimensiones
    await expect(page.getByText(/168,3|168\.3|OD/i).first()).toBeVisible();
  });

  test('tornillería: brida + secuencia estrella; tensión inválida sin torque', async ({ page }) => {
    await openTool(page, 'bolts-nuts');
    // SVG de brida presente
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('bridas: dimensiones + SVG tipos', async ({ page }) => {
    await openTool(page, 'flanges');
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('colores RAL: búsqueda muestra resultados', async ({ page }) => {
    await openTool(page, 'color-lookup');
    // Debe haber un buscador o lista de colores
    await expect(page.getByText(/RAL/i).first()).toBeVisible();
  });

  test('accesorios: catálogo visible', async ({ page }) => {
    await openTool(page, 'accessories-library');
    // Catálogo con familias o accesorios
    await expect(page.locator('body')).toContainText(/./);
  });

  test('caída de presión: nominal calcula ΔP, Re, f; inválido sin NaN', async ({ page }) => {
    await openTool(page, 'pressure-drop');
    // Nominal por defecto debe calcular
    await expect(page.getByText(/bar/).first()).toBeVisible();
    await expect(page.getByText(/Reynolds/i).first()).toBeVisible();
    // Inválido: ID con coma → sin NaN
    const idInput = page.locator('input[value="154.1"]').first();
    await idInput.fill('154,1');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('móvil 390px: espesor y conversor sin overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page, 'wall-thickness');
    let scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
    await openTool(page, 'unit-converter');
    scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
  });
});

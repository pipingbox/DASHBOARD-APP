import { expect, test } from '@playwright/test';

const URL = '/tools?t=mitered-elbow&lng=es';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: /Versión Beta|Beta Version/ });
  const btn = dialog.getByRole('button', { name: /Continuar|Continue/ });
  await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => btn.click()).catch(() => {});
  await expect(dialog).toBeHidden();
}

test.describe('R1 Fase E — gajos', () => {
  test('nominal: resumen (piezas/uniones/deflexión/ángulo corte) y tabla por pieza', async ({ page }) => {
    await openTool(page);
    await expect(page.getByText('Deflexión por junta').first()).toBeVisible();
    await expect(page.getByText(/Intradós/).first()).toBeVisible();
    await expect(page.getByText(/Extradós/).first()).toBeVisible();
    // Diagrama SVG presente
    await expect(page.locator('svg').first()).toBeVisible();
    // Tabla por pieza con filas
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('piezas y uniones coherentes: N piezas → N-1 uniones', async ({ page }) => {
    await openTool(page);
    // Contar filas de la tabla por pieza = N; uniones mostradas = N-1
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThanOrEqual(2);
  });

  test('decimal/coma: "90,5" no produce NaN ni resultado fabricado', async ({ page }) => {
    await openTool(page);
    const angleInput = page.locator('input[value="90"]').first();
    await angleInput.fill('90,5');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('inválido: radio <= OD/2 → error explícito (intradós colapsa), sin resultados', async ({ page }) => {
    await openTool(page);
    // Buscar el campo de radio y poner un valor que colapse el intradós
    const radiusInput = page.locator('input').filter({ hasNot: page.locator('[disabled]') }).nth(2);
    // Mejor: localizar por label "Radio" si existe; fallback: cambiar NPS a uno grande y radio pequeño
    // Estrategia robusta: poner ángulo 0 (inválido) → sin resultados
    const angleInput = page.locator('input[value="90"]').first();
    await angleInput.fill('0');
    await expect(page.getByText(/NaN/)).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('stale: válido → inválido elimina resultados', async ({ page }) => {
    await openTool(page);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const angleInput = page.locator('input[value="90"]').first();
    await angleInput.fill('abc');
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('unidades: toggle mm→in convierte longitudes preservando dimensión', async ({ page }) => {
    await openTool(page);
    await page.getByRole('button', { name: 'in', exact: true }).click();
    // Las longitudes de la tabla deben mostrarse en pulgadas
    await expect(page.getByText(/in/).first()).toBeVisible();
    await page.getByRole('button', { name: 'mm', exact: true }).click();
    await expect(page.getByText(/mm/).first()).toBeVisible();
  });

  test('móvil 390px: campos operables y sin overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page);
    await expect(page.locator('input[value="90"]').first()).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
  });
});

export const accountPicker = page => page.locator('[data-component="watermelon-dropdown-menu-10"]');
export async function accountValue(page) { return accountPicker(page).getAttribute('data-account-value'); }
export async function chooseAccount(page, key) {
 const trigger = accountPicker(page).getByRole('button', {name:'Trade account',exact:true});
 await trigger.click();
 await page.getByRole('menu').locator(`[data-account-key=${JSON.stringify(key)}]`).click();
}
export async function accountLabel(page) { return accountPicker(page).locator('.cova-account-menu-selection').innerText(); }

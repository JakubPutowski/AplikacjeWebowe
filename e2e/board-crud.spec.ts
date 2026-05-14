import { expect, test, type Page } from '@playwright/test';
import { LOCAL_ADMIN_LOGIN, LOCAL_ADMIN_PASSWORD } from '../src/app/auth.config';

const developerUser = {
  id: 'e2e-dev-user-1',
  email: 'dev.e2e@example.com',
  firstName: 'E2E',
  lastName: 'Developer',
  role: 'developer',
  isBlocked: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-01-01T00:00:00.000Z',
};

async function closeOverlayIfVisible(page: Page) {
  await page.keyboard.press('Escape').catch(() => undefined);
}

async function ensureBoardSession(page: Page) {
  const projectNameInput = page.getByTestId('project-name-input');
  try {
    await expect(projectNameInput).toBeVisible({ timeout: 7000 });
    return;
  } catch {
    // continue to login fallback
  }

  const localLoginButton = page.getByTestId('local-admin-login-btn');
  if (await localLoginButton.isVisible().catch(() => false)) {
    await page.getByTestId('local-admin-login-input').fill(LOCAL_ADMIN_LOGIN);
    await page.getByTestId('local-admin-password-input').fill(LOCAL_ADMIN_PASSWORD);
    await localLoginButton.click();
    await expect(projectNameInput).toBeVisible({ timeout: 10000 });
    return;
  }

  await expect(projectNameInput).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  await page.addInitScript((user) => {
    if (sessionStorage.getItem('__e2e_seeded') === 'true') {
      return;
    }

    localStorage.clear();
    localStorage.setItem('projects_data', JSON.stringify([]));
    localStorage.setItem('stories_data', JSON.stringify([]));
    localStorage.setItem('tasks_data', JSON.stringify([]));
    localStorage.setItem('notifications_data', JSON.stringify([]));
    localStorage.setItem('users_data', JSON.stringify([user]));
    localStorage.setItem('current_user_id', user.id);
    localStorage.removeItem('current_project_id');
    sessionStorage.setItem('__e2e_seeded', 'true');
  }, developerUser);

  await page.goto('/');
  await ensureBoardSession(page);
});

test('creates, edits, changes status, and deletes board entities', async ({ page }) => {
  const projectName = 'Projekt E2E';
  const updatedProjectName = 'Projekt E2E Updated';
  const storyName = 'Story E2E';
  const updatedStoryName = 'Story E2E Updated';
  const taskName = 'Task E2E';
  const updatedTaskName = 'Task E2E Updated';

  await page.getByTestId('project-name-input').fill(projectName);
  await page.getByTestId('project-desc-input').fill('Opis projektu E2E');
  await page.getByTestId('project-submit-btn').dispatchEvent('click');

  const projectCard = page.locator('[data-testid^="project-card-"]', { hasText: projectName }).first();
  await expect(projectCard).toBeVisible();

  const projectTestId = await projectCard.getAttribute('data-testid');
  expect(projectTestId).toBeTruthy();
  const projectId = projectTestId!.replace('project-card-', '');

  const selectedViaComponent = await page.evaluate((id) => {
    const angularApi = (window as unknown as { ng?: { getComponent: (node: Element) => unknown } }).ng;
    const root = document.querySelector('app-root');
    if (!angularApi || !root) return false;

    const component = angularApi.getComponent(root) as { selectProject?: (value: string) => void };
    if (!component || typeof component.selectProject !== 'function') return false;

    component.selectProject(id);
    return true;
  }, projectId);

  if (!selectedViaComponent) {
    await closeOverlayIfVisible(page);
    await page.getByTestId('project-select').click({ force: true });
    await page.locator(`[data-testid="project-option-${projectId}"]`).click({ force: true });
    await closeOverlayIfVisible(page);
  }

  await expect(page.getByTestId('story-name-input')).toBeVisible();
  await closeOverlayIfVisible(page);

  await page.getByTestId('story-name-input').fill(storyName);
  await page.getByTestId('story-desc-input').fill('Opis story E2E');
  await page.getByTestId('story-submit-btn').dispatchEvent('click');

  const storyCard = page.locator('[data-testid^="story-card-"]', { hasText: storyName }).first();
  await expect(storyCard).toBeVisible();

  const storyTestId = await storyCard.getAttribute('data-testid');
  expect(storyTestId).toBeTruthy();
  const storyId = storyTestId!.replace('story-card-', '');

  await closeOverlayIfVisible(page);
  await storyCard.dispatchEvent('click');
  await expect(page.getByTestId('task-name-input')).toBeVisible();
  await expect(page.getByTestId('task-submit-btn')).toBeEnabled();

  await page.getByTestId('task-name-input').fill(taskName);
  await page.getByTestId('task-desc-input').fill('Opis taska E2E');
  await page.getByTestId('task-expected-hours-input').fill('2');
  const taskSubmitButton = page.getByTestId('task-submit-btn');
  await taskSubmitButton.dispatchEvent('click');

  const taskCard = page.locator('[data-testid^="task-card-"]', { hasText: taskName }).first();
  await expect(taskCard).toBeVisible();

  const taskTestId = await taskCard.getAttribute('data-testid');
  expect(taskTestId).toBeTruthy();
  const taskId = taskTestId!.replace('task-card-', '');

  await page.getByTestId(`task-start-btn-${taskId}`).dispatchEvent('click');
  await page.getByTestId(`task-complete-btn-${taskId}`).dispatchEvent('click');

  await page.getByTestId(`project-edit-btn-${projectId}`).dispatchEvent('click');
  await page.getByTestId('project-name-input').fill(updatedProjectName);
  await page.getByTestId('project-desc-input').fill('Opis projektu po edycji');
  await page.getByTestId('project-submit-btn').dispatchEvent('click');
  await expect(page.locator('[data-testid^="project-card-"]', { hasText: updatedProjectName })).toBeVisible();

  await page.getByTestId(`story-edit-btn-${storyId}`).first().dispatchEvent('click');
  await page.getByTestId('story-name-input').fill(updatedStoryName);
  await page.getByTestId('story-desc-input').fill('Opis story po edycji');
  await page.getByTestId('story-submit-btn').dispatchEvent('click');
  await expect(page.locator('[data-testid^="story-card-"]', { hasText: updatedStoryName })).toBeVisible();

  await page.getByTestId(`task-edit-btn-${taskId}`).first().dispatchEvent('click');
  await page.getByTestId('task-name-input').fill(updatedTaskName);
  await page.getByTestId('task-desc-input').fill('Opis taska po edycji');
  await page.getByTestId('task-expected-hours-input').fill('3');
  await taskSubmitButton.dispatchEvent('click');
  await expect(page.locator('[data-testid^="task-card-"]', { hasText: updatedTaskName })).toBeVisible();

  await page.getByTestId(`task-delete-btn-${taskId}`).first().dispatchEvent('click');
  await expect(page.locator(`[data-testid="task-card-${taskId}"]`)).toHaveCount(0);

  await page.getByTestId(`story-delete-btn-${storyId}`).first().dispatchEvent('click');
  await expect(page.locator(`[data-testid="story-card-${storyId}"]`)).toHaveCount(0);

  await page.getByTestId(`project-delete-btn-${projectId}`).dispatchEvent('click');
  await expect(page.locator(`[data-testid="project-card-${projectId}"]`)).toHaveCount(0);
});

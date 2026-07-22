import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  resolvePresenceE2EEnvironment,
  type PresenceE2EAccount,
  type PresenceE2EEnvironment,
} from "./local-fixture";

const PASSWORD_LABEL = /^(?:Password|Senha)$/i;
const SIGN_IN_BUTTON_NAME = /^(?:Sign In|Entrar)$/i;

interface RuntimeUser {
  id: string;
  companyId: string | null;
  email: string;
  displayName: string;
}

interface RuntimeSpace {
  id: string;
  name: string;
  status: string;
  capacity: number;
  accessControl?: { isPublic?: boolean };
}

interface LoggedInBrowser {
  context: BrowserContext;
  page: Page;
  user: RuntimeUser;
  spaces: RuntimeSpace[];
}

async function warmKnockRoutes(request: APIRequestContext): Promise<void> {
  const placeholderId = "00000000-0000-4000-8000-000000000000";
  const responses = await Promise.all([
    request.get("/api/users/list"),
    request.get("/api/presence/snapshot"),
    request.post("/api/presence/location", { data: {} }),
    request.get(`/api/spaces?companyId=${placeholderId}`),
    request.post("/api/spaces/knock/request", { data: {} }),
    request.post("/api/spaces/knock/respond", { data: {} }),
    request.get(
      `/api/spaces/knock/pending?spaceId=${placeholderId}&sessionId=${placeholderId}`,
    ),
    request.get(
      `/api/spaces/knock/status/${placeholderId}?sessionId=${placeholderId}`,
    ),
  ]);
  await Promise.all(responses.map((response) => response.dispose()));
}

async function login(page: Page, account: PresenceE2EAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel(PASSWORD_LABEL).fill(account.password);
  await page.getByRole("button", { name: SIGN_IN_BUTTON_NAME }).click();
  await page.waitForURL(/\/floor-plan/, {
    timeout: 30_000,
    waitUntil: "commit",
  });
  await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const response = await fetch("/api/presence/snapshot");
          if (!response.ok) return false;
          const snapshot = (await response.json()) as {
            viewerUserId: string;
            users: Array<{ id: string; isConnected: boolean }>;
          };
          return snapshot.users.some(
            (user) =>
              user.id === snapshot.viewerUserId && user.isConnected === true,
          );
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function readRuntimeModel(
  page: Page,
  account: PresenceE2EAccount,
): Promise<{ user: RuntimeUser; spaces: RuntimeSpace[] }> {
  const usersPayload = await page.evaluate(async () => {
    const response = await fetch("/api/users/list");
    if (!response.ok)
      throw new Error(`users/list failed with ${response.status}`);
    return response.json() as Promise<{ users: RuntimeUser[] }>;
  });
  const user = usersPayload.users.find(
    (candidate) =>
      candidate.email.toLowerCase() === account.email.toLowerCase(),
  );
  if (!user?.companyId)
    throw new Error(`No company-bound app user for ${account.email}`);

  const spacesPayload = await page.evaluate(async (companyId) => {
    const response = await fetch(
      `/api/spaces?companyId=${encodeURIComponent(companyId)}`,
    );
    if (!response.ok) throw new Error(`spaces failed with ${response.status}`);
    return response.json() as Promise<{ spaces: RuntimeSpace[] }>;
  }, user.companyId);
  return { user, spaces: spacesPayload.spaces };
}

async function openLoggedInBrowser(
  browser: Browser,
  account: PresenceE2EAccount,
): Promise<LoggedInBrowser> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 600 },
  });
  const page = await context.newPage();
  await login(page, account);
  const model = await readRuntimeModel(page, account);
  return { context, page, ...model };
}

function spaceCard(page: Page, spaceId: string) {
  return page.locator(`[data-testid="space-${spaceId}"]`);
}

async function moveThroughFooter(page: Page, spaceId: string): Promise<void> {
  const card = spaceCard(page, spaceId);
  if ((await card.getAttribute("data-user-in-space")) === "true") return;

  const responsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      return (
        request.method() === "POST" &&
        new URL(response.url()).pathname === "/api/presence/location"
      );
    },
    { timeout: 30_000 },
  );
  await card.getByRole("button", { name: "Enter" }).click();
  const response = await responsePromise;
  const body = await response.text();
  expect(
    response.ok(),
    `location transition failed (${response.status()}): ${body}`,
  ).toBe(true);
  await expect(card).toHaveAttribute("data-user-in-space", "true", {
    timeout: 30_000,
  });
}

async function waitForOccupant(
  page: Page,
  spaceId: string,
  displayName: string,
): Promise<void> {
  await expect(
    spaceCard(page, spaceId).getByLabel(`${displayName}'s avatar`, {
      exact: true,
    }),
  ).toHaveCount(1, { timeout: 30_000 });
}

async function sendKnockThroughUi(
  page: Page,
  space: RuntimeSpace,
): Promise<void> {
  const card = spaceCard(page, space.id);
  const footerKnock = card.getByRole("button", { name: "Knock", exact: true });
  if (await footerKnock.isVisible().catch(() => false)) {
    await footerKnock.click();
    return;
  }

  // Direct-entry rooms truthfully expose Enter in the footer. The existing context
  // menu exposes the same real Knock handler as "Knock Instead" for that state.
  await card.getByRole("button", { name: `Actions for ${space.name}` }).click();
  await page.getByRole("menuitem", { name: "Knock Instead" }).click();
}

async function expectBannerNearTopCenter(page: Page): Promise<void> {
  const host = page.getByTestId("global-knock-banner-host");
  await expect(host).toBeVisible({ timeout: 30_000 });
  const box = await host.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.y).toBeLessThanOrEqual(24);
  expect(
    Math.abs(box.x + box.width / 2 - viewport.width / 2),
  ).toBeLessThanOrEqual(32);
}

async function expectKnockControlsUnobstructedWhileToastActive(
  page: Page,
  approveLabel: string,
  denyLabel: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ labels }) => {
            const toast = Array.from(
              document.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
            ).find((element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                Number(style.opacity) !== 0 &&
                rect.width > 0 &&
                rect.height > 0
              );
            });
            if (!toast) return false;

            const buttons = Array.from(
              document.querySelectorAll<HTMLButtonElement>("button"),
            );
            const knockControlsAreClear = labels.every((label) => {
              const button = buttons.find(
                (candidate) => candidate.getAttribute("aria-label") === label,
              );
              if (!button) return false;
              const rect = button.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
              return hit === button || (hit !== null && button.contains(hit));
            });
            if (!knockControlsAreClear) return false;

            const messagingTrigger = document.querySelector<HTMLElement>(
              '[data-testid="messaging-drawer-trigger"]',
            );
            if (!messagingTrigger) return false;
            const triggerRect = messagingTrigger.getBoundingClientRect();
            const triggerHit = document.elementFromPoint(
              triggerRect.left + triggerRect.width / 2,
              triggerRect.top + triggerRect.height / 2,
            );
            return (
              triggerHit === messagingTrigger ||
              (triggerHit !== null && messagingTrigger.contains(triggerHit))
            );
          },
          { labels: [approveLabel, denyLabel] },
        ),
      {
        message:
          "a real Sonner toast must be visible while Knock controls and the Messaging trigger remain unobstructed",
        timeout: 3_000,
      },
    )
    .toBe(true);
}

async function closeContexts(...contexts: BrowserContext[]): Promise<void> {
  for (const context of contexts) {
    await context.close();
  }
}

test.describe("Global Knock banner obstruction regression", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);

  let environment: PresenceE2EEnvironment;

  test.beforeAll(async () => {
    environment = await resolvePresenceE2EEnvironment();
  });

  test("keeps approve and deny operable with a real toast and delivers both outcomes", async ({
    browser,
    request,
  }) => {
    await warmKnockRoutes(request);
    const admin = await openLoggedInBrowser(browser, environment.admin);
    const member = await openLoggedInBrowser(browser, environment.member);

    try {
      const directEntrySpaces = admin.spaces.filter(
        (space) =>
          space.accessControl?.isPublic !== false &&
          ["active", "available"].includes(space.status) &&
          space.capacity >= 2,
      );
      const targetSpace = directEntrySpaces[0];
      const counterSpace = directEntrySpaces.find(
        (space) => space.id !== targetSpace?.id,
      );
      expect(
        targetSpace,
        "the fixture must provide a direct-entry target space",
      ).toBeTruthy();
      expect(
        counterSpace,
        "the fixture must provide a second direct-entry space",
      ).toBeTruthy();
      if (!targetSpace || !counterSpace)
        throw new Error("Knock obstruction fixture is incomplete.");

      await moveThroughFooter(admin.page, targetSpace.id);
      await moveThroughFooter(member.page, counterSpace.id);
      await waitForOccupant(
        member.page,
        targetSpace.id,
        admin.user.displayName,
      );
      await waitForOccupant(
        admin.page,
        counterSpace.id,
        member.user.displayName,
      );

      await sendKnockThroughUi(member.page, targetSpace);
      const adminApprove = admin.page.getByRole("button", {
        name: `Let ${member.user.displayName} in`,
      });
      const adminDeny = admin.page.getByRole("button", {
        name: `Deny ${member.user.displayName}`,
      });
      await expect(adminApprove).toBeVisible({ timeout: 30_000 });
      await expect(adminDeny).toBeVisible({ timeout: 30_000 });
      await expectBannerNearTopCenter(admin.page);
      await expect(
        admin.page.getByTestId("global-knock-banner-host"),
      ).toContainText(member.user.displayName);

      // Produce a genuine Sonner toast on the responder while its incoming banner
      // remains mounted: the responder knocks back and the requester denies it.
      await sendKnockThroughUi(admin.page, counterSpace);
      const memberDeny = member.page.getByRole("button", {
        name: `Deny ${admin.user.displayName}`,
      });
      await expect(memberDeny).toBeVisible({ timeout: 30_000 });
      await memberDeny.click();
      const activeToast = admin.page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /Access denied/i })
        .first();
      await expect(activeToast).toBeVisible({ timeout: 30_000 });

      await expectKnockControlsUnobstructedWhileToastActive(
        admin.page,
        `Let ${member.user.displayName} in`,
        `Deny ${member.user.displayName}`,
      );
      await adminApprove.click();
      await expect(adminApprove).toBeHidden({ timeout: 30_000 });
      await expect(
        admin.page.getByTestId("global-knock-banner-host"),
      ).toHaveCount(0, { timeout: 30_000 });
      await expect(
        member.page
          .locator("[data-sonner-toast]")
          .filter({
            hasText: /Approved by|Joined after approval/i,
          })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(spaceCard(member.page, targetSpace.id)).toHaveAttribute(
        "data-user-in-space",
        "true",
        { timeout: 30_000 },
      );

      // Fresh request in the reverse direction exercises the deny path without
      // reusing the just-consumed requester/space pair.
      await moveThroughFooter(admin.page, counterSpace.id);
      await waitForOccupant(
        admin.page,
        targetSpace.id,
        member.user.displayName,
      );
      await sendKnockThroughUi(admin.page, targetSpace);
      const reverseDeny = member.page.getByRole("button", {
        name: `Deny ${admin.user.displayName}`,
      });
      await expect(reverseDeny).toBeVisible({ timeout: 30_000 });
      await reverseDeny.click();
      await expect(reverseDeny).toBeHidden({ timeout: 30_000 });
      await expect(
        member.page.getByTestId("global-knock-banner-host"),
      ).toHaveCount(0, { timeout: 30_000 });
      await expect(
        admin.page
          .locator("[data-sonner-toast]")
          .filter({ hasText: /Access denied/i })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(spaceCard(admin.page, targetSpace.id)).toHaveAttribute(
        "data-user-in-space",
        "false",
      );
    } finally {
      await closeContexts(admin.context, member.context);
    }
  });

  test("keeps keyboard focus out of the inert mobile floor-plan background", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, environment.admin);
    const { spaces } = await readRuntimeModel(page, environment.admin);
    const detailSpace = spaces.find((space) =>
      ["active", "available"].includes(space.status),
    );
    expect(
      detailSpace,
      "the fixture must provide a space whose detail sheet can open",
    ).toBeTruthy();
    if (!detailSpace) throw new Error("Mobile detail fixture is incomplete.");

    const card = spaceCard(page, detailSpace.id);
    const background = page.getByTestId("modern-floor-plan-background");
    const dialog = page.getByRole("dialog", {
      name: `Space Details: ${detailSpace.name}`,
    });

    const openSheet = async () => {
      await card.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await expect(background).toHaveAttribute("inert", "");
    };

    await openSheet();
    for (let press = 0; press < 20; press += 1) {
      await page.keyboard.press("Tab");
      const focusIsBehindScrim = await page.evaluate(() => {
        const floorPlan = document.querySelector(
          '[data-testid="modern-floor-plan-background"]',
        );
        return Boolean(
          floorPlan &&
            document.activeElement &&
            floorPlan.contains(document.activeElement),
        );
      });
      expect(focusIsBehindScrim).toBe(false);
    }
    await page.screenshot({
      path: "spec-interview/spaces-visualization-redesign/evidence/phase-3/r4-mobile-sheet-focus-390x844.png",
    });

    await dialog.getByRole("button", { name: "Close panel" }).click();
    await expect(dialog).toBeHidden();
    await expect(background).not.toHaveAttribute("inert", "");

    await openSheet();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(background).not.toHaveAttribute("inert", "");

    await openSheet();
    await page.getByTestId("space-detail-backdrop").click({
      position: { x: 12, y: 12 },
    });
    await expect(dialog).toBeHidden();
    await expect(background).not.toHaveAttribute("inert", "");
  });
});

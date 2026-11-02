
<script>
  import { page } from "$app/state";

  /** @type {import('./$types').LayoutProps} */
  let { data, children } = $props();

  let isLoggingOut = $state(false);
  let logoutError = $state("");

  let pageTitle = $derived(
    page.url.pathname === "/admin" ? "Overview"
    : page.url.pathname.startsWith("/admin/songs") ? "Music Library"
    : page.url.pathname.startsWith("/admin/upload") ? "Song Upload"
    : page.url.pathname.startsWith("/admin/classifications") ? "Classifications"
    : page.url.pathname.startsWith("/admin/publishing") ? "Publishing"
    : "Administration"
);

  async function handleLogout() {
    if (isLoggingOut) return;

    isLoggingOut = true;
    logoutError = "";

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST"
      });

      let result = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok) {
        logoutError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to log out. Please try again.";

        return;
      }

      window.location.assign("/");
    } catch {
      logoutError =
        "Unable to contact the server. Please try again.";
    } finally {
      isLoggingOut = false;
    }
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-shell">
  <aside class="sidebar">
    <a class="brand" href="/admin">
      <span class="brand-icon" aria-hidden="true">♫</span>

      <span class="brand-copy">
        <strong>Music Archive</strong>
        <small>ADMIN WORKSPACE</small>
      </span>
    </a>

    <p class="nav-heading">WORKSPACE</p>

    <nav aria-label="Administrator navigation">
      <a
        href="/admin"
        class="nav-item"
        class:active={page.url.pathname === "/admin"}
        aria-current={page.url.pathname === "/admin"
          ? "page"
          : undefined}
        title="Overview"
      >
        <span class="nav-icon" aria-hidden="true">▦</span>
        <span class="nav-label">Overview</span>
      </a>

      <a
        href="/admin/songs"
        class="nav-item"
        class:active={page.url.pathname.startsWith("/admin/songs")}
        aria-current={page.url.pathname.startsWith("/admin/songs")
          ? "page"
          : undefined}
        title="Music Library"
      >
        <span class="nav-icon" aria-hidden="true">♫</span>
        <span class="nav-label">Music Library</span>
      </a>

      <a
        href="/admin/upload"
        class="nav-item"
        class:active={page.url.pathname.startsWith("/admin/upload")}
        aria-current={page.url.pathname.startsWith("/admin/upload")
          ? "page"
          : undefined}
        title="Song Upload"
      >
        <span class="nav-icon" aria-hidden="true">↑</span>
        <span class="nav-label">Song Upload</span>
      </a>

      <a
        href="/admin/classifications"
        class="nav-item"
        class:active={page.url.pathname.startsWith("/admin/classifications")}
        aria-current={page.url.pathname.startsWith("/admin/classifications")
          ? "page"
          : undefined}
        title="Classifications"
      >
        <span class="nav-icon" aria-hidden="true">◈</span>
        <span class="nav-label">Classifications</span>
      </a>

  <a
    href="/admin/publishing"
    class="nav-item"
    class:active={page.url.pathname.startsWith("/admin/publishing")}
    aria-current={page.url.pathname.startsWith("/admin/publishing") ? "page" : undefined}
    title="Publishing"
  >
    <span class="nav-icon" aria-hidden="true">◎</span>
    <span class="nav-label">Publishing</span>
    </a>
</nav>

    <div class="sidebar-bottom">
      <span class="status-dot" aria-hidden="true"></span>
      <span class="nav-label">Administrator workspace</span>
    </div>
  </aside>

  <div class="main-area">
    <header class="topbar">
      <div class="page-heading">
        <p class="eyebrow">ADMINISTRATION</p>
        <h1>{pageTitle}</h1>
      </div>

      <div class="account-area">
        <div class="account-info">
          <span class="avatar" aria-hidden="true">
            {data.admin.email.slice(0, 1).toUpperCase()}
          </span>

          <div class="account-text">
            <strong>{data.admin.email}</strong>
            <span>{data.admin.role}</span>
          </div>
        </div>

        <button
          class="logout-button"
          type="button"
          onclick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? "Signing out..." : "Log out"}
        </button>
      </div>
    </header>

    {#if logoutError}
      <div class="logout-error" role="alert">
        {logoutError}
      </div>
    {/if}

    <div class="page-content">
      {@render children()}
    </div>

    <footer class="page-footer">
      Music Archive · Administrator workspace
    </footer>
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    min-width: 320px;
    min-height: 100%;
    background: #0b1020;
  }

  :global(body) {
    margin: 0;
    color: #eef1f7;
    font-family:
      Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .admin-shell {
    display: flex;
    min-height: 100vh;
    min-height: 100svh;
    background: #0b1020;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 10;
    display: flex;
    width: 244px;
    flex-direction: column;
    padding: 28px 16px 20px;
    border-right: 1px solid #242c3d;
    background: #101728;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px 34px;
    color: inherit;
    text-decoration: none;
  }

  .brand-icon {
    display: grid;
    width: 43px;
    height: 43px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 12px;
    background: #d9b87b;
    color: #151a28;
    font-size: 26px;
  }

  .brand-copy strong,
  .brand-copy small {
    display: block;
  }

  .brand-copy strong {
    font-size: 15px;
    font-weight: 650;
  }

  .brand-copy small {
    margin-top: 5px;
    color: #929cb1;
    font-size: 9px;
    letter-spacing: 0.15em;
  }

  .nav-heading,
  .eyebrow {
    color: #929cb1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }

  .nav-heading {
    margin: 9px 10px 13px;
  }

  nav {
    display: grid;
    gap: 7px;
  }

  .nav-item {
    display: flex;
    min-height: 43px;
    align-items: center;
    gap: 11px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #c2c9d8;
    font-size: 12px;
    text-decoration: none;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .nav-item:hover:not(.nav-disabled) {
    background: #1d2638;
    color: #f0d29b;
  }

  .nav-item.active {
    background: #282b35;
    color: #f2d29b;
  }

  .nav-item:focus-visible {
    outline: 2px solid #d9b87b;
    outline-offset: 3px;
  }

  .nav-icon {
    display: grid;
    width: 19px;
    flex-shrink: 0;
    place-items: center;
    font-size: 17px;
  }

  .sidebar-bottom {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: auto;
    padding: 14px 8px 0;
    border-top: 1px solid #293144;
    color: #929cb1;
    font-size: 10px;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 50%;
    background: #7cc9a5;
  }

  .main-area {
    display: flex;
    min-width: 0;
    min-height: 100vh;
    flex: 1;
    flex-direction: column;
    margin-left: 244px;
  }

  .topbar {
    display: flex;
    min-height: 82px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 18px 32px;
    border-bottom: 1px solid #242c3d;
    background: #0f1626;
  }

  .page-heading .eyebrow {
    margin: 0 0 7px;
  }

  h1 {
    margin: 0;
    font-size: 23px;
    font-weight: 650;
    letter-spacing: -0.03em;
  }

  .account-area,
  .account-info {
    display: flex;
    align-items: center;
  }

  .account-area {
    gap: 20px;
  }

  .account-info {
    gap: 10px;
    min-width: 0;
  }

  .avatar {
    display: grid;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid #746040;
    border-radius: 50%;
    background: #2c2930;
    color: #f0d29b;
    font-size: 13px;
    font-weight: 700;
  }

  .account-text {
    min-width: 0;
  }

  .account-text strong,
  .account-text span {
    display: block;
  }

  .account-text strong {
    max-width: 240px;
    overflow: hidden;
    color: #e2e6ef;
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
  }

  .account-text span {
    margin-top: 4px;
    color: #929cb1;
    font-size: 10px;
  }

  .logout-button {
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid #40495c;
    border-radius: 8px;
    background: transparent;
    color: #e2e6ef;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .logout-button:hover:not(:disabled) {
    border-color: #d9b87b;
    color: #f0d29b;
  }

  .logout-button:focus-visible {
    outline: 2px solid #d9b87b;
    outline-offset: 3px;
  }

  .logout-button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .logout-error {
    margin: 18px 28px 0;
    padding: 13px 15px;
    border: 1px solid #713b43;
    border-radius: 8px;
    background: #321d28;
    color: #ffb5ba;
    font-size: 12px;
    line-height: 1.6;
  }

  .page-content {
    width: 100%;
    min-width: 0;
    flex: 1;
  }

  .page-footer {
    padding: 20px 32px;
    border-top: 1px solid #242c3d;
    color: #7f8ba2;
    font-size: 10px;
  }

  @media (max-width: 760px) {
    .sidebar {
      width: 68px;
      padding: 18px 8px;
      overflow-y: auto;
    }

    .brand {
      justify-content: center;
      padding: 0 0 26px;
    }

    .brand-copy,
    .nav-heading,

    .nav-item {
      justify-content: center;
      padding: 10px 0;
    }

    .nav-icon {
      font-size: 19px;
    }

    .sidebar-bottom {
      justify-content: center;
      padding: 14px 0 0;
    }

    .main-area {
      margin-left: 68px;
    }

    .topbar {
      align-items: flex-start;
      padding: 18px 15px;
      gap: 10px;
    }

    h1 {
      font-size: 20px;
    }

    .account-area {
      gap: 8px;
    }

    .account-text {
      display: none;
    }

    .logout-button {
      padding: 8px 9px;
      font-size: 10px;
    }

    .page-footer {
      padding: 18px 15px;
    }
  }

  @media (max-width: 420px) {
    .sidebar {
      width: 56px;
      padding-right: 5px;
      padding-left: 5px;
    }

    .brand-icon {
      width: 38px;
      height: 38px;
    }

    .main-area {
      margin-left: 56px;
    }

    .topbar {
      flex-wrap: wrap;
    }

    .account-area {
      justify-content: flex-end;
    }
  }
</style>

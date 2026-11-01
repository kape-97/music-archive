<script>
  let email = $state("");
  let password = $state("");
  let isSubmitting = $state(false);
  let errorMessage = $state("");

  /** @type {{ id: number, email: string, role: string } | null} */
  let signedInAdmin = $state(null);

  /**
   * Submit credentials to the existing administrator login endpoint.
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    errorMessage = "";
    isSubmitting = true;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      /** @type {{ error?: string, message?: string, user?: { id: number, email: string, role: string } } | null} */
      let result = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok) {
        errorMessage =
          typeof result?.error === "string"
            ? result.error
            : "Unable to sign in. Please try again.";

        return;
      }

      if (
        !result?.user ||
        typeof result.user.email !== "string"
      ) {
        errorMessage =
          "The server returned an unexpected response. Please try again.";

        return;
      }

      signedInAdmin = result.user;
        password = "";
        window.location.assign("/admin");
        return;

    } catch {
      errorMessage =
        "Unable to connect to the server. Please try again.";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Administrator Sign In | Music Archive</title>
  <meta
    name="description"
    content="Administrator sign-in for the Music Archive."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page-shell">
  <main class="login-card">
    <div class="brand-mark" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 18V5L21 3V16"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <ellipse
          cx="6"
          cy="18"
          rx="3"
          ry="2"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <ellipse
          cx="18"
          cy="16"
          rx="3"
          ry="2"
          stroke="currentColor"
          stroke-width="1.8"
        />
      </svg>
    </div>

    <p class="brand-name">Music Archive</p>
    <p class="eyebrow">ADMINISTRATION</p>

    {#if signedInAdmin}
      <h1>Welcome back.</h1>

      <p class="intro">
        You have successfully signed in to your music archive.
      </p>

      <div class="status-message success" role="status">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 12.5L10 17L19 7"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <div>
          <strong>Authentication successful</strong>
          <p>{signedInAdmin.email}</p>
          <span>Role: {signedInAdmin.role}</span>
        </div>
      </div>

      <p class="next-step">
        Your sign-in has been verified. The administrative
        workspace will be developed in the next phase.
      </p>
    {:else}
      <h1>Welcome back.</h1>

      <p class="intro">
        Sign in to manage your music collection.
      </p>

      <form onsubmit={handleSubmit}>
        {#if errorMessage}
          <div class="status-message error" role="alert">
            {errorMessage}
          </div>
        {/if}

        <div class="form-field">
          <label for="email">Administrator email</label>

          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            bind:value={email}
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            required
            disabled={isSubmitting}
          />
        </div>

        <div class="form-field">
          <label for="password">Password</label>

          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            bind:value={password}
            autocomplete="current-password"
            required
            disabled={isSubmitting}
          />
        </div>

        <button
          type="submit"
          class="submit-button"
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <span class="spinner" aria-hidden="true"></span>
            Signing in...
          {:else}
            Sign in
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12H19M12 5L19 12L12 19"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          {/if}
        </button>
      </form>

      <p class="security-note">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="5"
            y="10"
            width="14"
            height="11"
            rx="2"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path
            d="M8 10V7A4 4 0 0 1 16 7V10"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>

        Secure access for authorized administrators
      </p>
    {/if}

    <footer>
      Your collection. Your music. Your archive.
    </footer>
  </main>

  <p class="page-caption">
    A personal home for the music worth keeping.
  </p>
</div>

<style>
  :global(html) {
    min-width: 320px;
    min-height: 100%;
    background: #0b1020;
  }

  :global(body) {
    margin: 0;
    color: #f4f5f9;
    font-family:
      Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .page-shell {
    position: relative;
    isolation: isolate;
    display: flex;
    min-height: 100vh;
    min-height: 100svh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 48px 20px 24px;
    background:
      radial-gradient(
        ellipse at 15% 15%,
        rgba(61, 86, 145, 0.23),
        transparent 40%
      ),
      radial-gradient(
        ellipse at 85% 85%,
        rgba(180, 139, 72, 0.12),
        transparent 35%
      ),
      #0b1020;
  }

  .login-card {
    width: 100%;
    max-width: 440px;
    padding: 42px 38px 30px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    background: rgba(17, 24, 42, 0.93);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);
  }

  .brand-mark {
    display: grid;
    width: 50px;
    height: 50px;
    margin-bottom: 16px;
    place-items: center;
    border: 1px solid rgba(231, 195, 133, 0.35);
    border-radius: 14px;
    background: linear-gradient(
      145deg,
      #d8b678,
      #a47d3e
    );
    color: #151827;
  }

  .brand-mark svg {
    width: 26px;
    height: 26px;
  }

  .brand-name {
    margin: 0;
    color: #f0d39b;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: 0.03em;
  }

  .eyebrow {
    margin: 34px 0 12px;
    color: #aeb6ca;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
  }

  h1 {
    margin: 0;
    font-size: clamp(28px, 6vw, 34px);
    font-weight: 650;
    letter-spacing: -0.04em;
    line-height: 1.2;
  }

  .intro {
    margin: 12px 0 30px;
    color: #abb3c4;
    font-size: 14px;
    line-height: 1.7;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 21px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  label {
    color: #e6e9f0;
    font-size: 13px;
    font-weight: 550;
  }

  input {
    width: 100%;
    min-height: 48px;
    padding: 13px 14px;
    border: 1px solid #354058;
    border-radius: 9px;
    outline: none;
    background: #0d1424;
    color: #f7f8fb;
    font: inherit;
    font-size: 14px;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  input::placeholder {
    color: #68748b;
  }

  input:focus {
    border-color: #d4ad6c;
    box-shadow: 0 0 0 3px rgba(212, 173, 108, 0.12);
  }

  input:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .submit-button {
    display: flex;
    min-height: 49px;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 5px;
    padding: 12px 18px;
    border: 0;
    border-radius: 9px;
    background: #d9b87b;
    color: #171923;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .submit-button:hover:not(:disabled) {
    background: #ebca8e;
    transform: translateY(-1px);
  }

  .submit-button:focus-visible {
    outline: 3px solid rgba(235, 202, 142, 0.65);
    outline-offset: 3px;
  }

  .submit-button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .submit-button svg {
    width: 18px;
    height: 18px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(23, 25, 35, 0.25);
    border-top-color: #171923;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  .status-message {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 13px;
    border: 1px solid transparent;
    border-radius: 9px;
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .status-message.error {
    margin-bottom: 1px;
    border-color: rgba(248, 113, 113, 0.28);
    background: rgba(127, 29, 29, 0.18);
    color: #fca5a5;
  }

  .status-message.success {
    margin: 24px 0 17px;
    border-color: rgba(110, 231, 183, 0.23);
    background: rgba(6, 78, 59, 0.2);
    color: #a7f3d0;
  }

  .status-message.success svg {
    width: 21px;
    height: 21px;
    flex-shrink: 0;
  }

  .status-message.success strong {
    display: block;
    margin-bottom: 5px;
    font-size: 14px;
  }

  .status-message.success p {
    margin: 0 0 5px;
    color: #e4f5ed;
    overflow-wrap: anywhere;
  }

  .status-message.success span {
    color: #9bb8ac;
    font-size: 12px;
  }

  .next-step {
    margin: 0;
    color: #abb3c4;
    font-size: 13px;
    line-height: 1.7;
  }

  .security-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 22px 0 0;
    color: #8994aa;
    font-size: 11px;
    text-align: center;
  }

  .security-note svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  footer {
    margin-top: 31px;
    padding-top: 21px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #8791a6;
    font-size: 11px;
    text-align: center;
  }

  .page-caption {
    margin: 22px 0 0;
    color: #7e899f;
    font-size: 12px;
    text-align: center;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 480px) {
    .page-shell {
      padding: 24px 15px;
    }

    .login-card {
      padding: 32px 23px 25px;
      border-radius: 16px;
    }

    .eyebrow {
      margin-top: 28px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
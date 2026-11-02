
<script>
  import { onMount } from "svelte";

  /** @type {Array<{ id: number, title: string, artist: string, isPublished: boolean }>} */
  let songs = $state([]);

  let songsLoading = $state(true);
  let songsError = $state("");

  let classificationsCount = $state(0);
  let classificationsLoading = $state(true);
  let classificationsError = $state("");

  let draftCount = $derived(
    songs.filter((song) => !song.isPublished).length
  );

  let publishedCount = $derived(
    songs.filter((song) => song.isPublished).length
  );

  // The existing GET endpoint returns songs ordered by display order
  // and creation date. Use its results for the overview statistics.
  onMount(() => {
    void loadSongs();
    void loadClassifications();
  });

  async function loadSongs() {
    try {
      const response = await fetch("/api/admin/songs");
      const result = await response.json();

      if (!response.ok) {
        songsError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to load song statistics.";

        return;
      }

      if (!Array.isArray(result?.songs)) {
        songsError = "The server returned an unexpected song list.";
        return;
      }

      songs = result.songs;
    } catch {
      songsError = "Unable to connect to the music library.";
    } finally {
      songsLoading = false;
    }
  }

  async function loadClassifications() {
    try {
      const response = await fetch("/api/admin/classifications");
      const result = await response.json();

      if (!response.ok) {
        classificationsError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to load classification statistics.";

        return;
      }

      // Support either a direct array or an object containing
      // the classifications array.
      const classifications = Array.isArray(result)
        ? result
        : result?.classifications;

      if (!Array.isArray(classifications)) {
        classificationsError =
          "The server returned an unexpected classification list.";

        return;
      }

      classificationsCount = classifications.length;
    } catch {
      classificationsError =
        "Unable to connect to classification management.";
    } finally {
      classificationsLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Overview | Music Archive</title>
</svelte:head>

<div class="overview">
  <section class="welcome-panel">
    <div>
      <p class="eyebrow">OVERVIEW</p>
      <h2>Welcome to your archive, Kapil.</h2>
      <p>
        Manage your music collection here as administrator.
      </p>

      <a class="primary-action" href="/admin/upload">
        <span aria-hidden="true">↑</span>
        Upload a new song
      </a>
    </div>

    <div class="welcome-icon" aria-hidden="true">♫</div>
  </section>

  <section class="stats-section" aria-labelledby="stats-heading">
    <div class="section-heading">
      <h2 id="stats-heading">Collection overview</h2>
      <p>Current information from your music archive.</p>
    </div>

    <div class="stats-grid">
      <article class="stat-card">
        <span class="stat-icon" aria-hidden="true">♫</span>
        <p class="card-label">Total songs</p>

        {#if songsLoading}
          <h3 class="stat-value">Loading...</h3>
          <p class="card-description">Retrieving your collection.</p>
        {:else if songsError}
          <h3 class="stat-value">Unavailable</h3>
          <p class="card-description">{songsError}</p>
        {:else}
          <h3 class="stat-value">{songs.length}</h3>
          <p class="card-description">Songs in your archive.</p>
        {/if}

        <a class="card-link" href="/admin/songs">
          Open Music Library →
        </a>
      </article>

      <article class="stat-card">
        <span class="stat-icon" aria-hidden="true">◷</span>
        <p class="card-label">Drafts</p>

        {#if songsLoading}
          <h3 class="stat-value">Loading...</h3>
          <p class="card-description">Retrieving publication status.</p>
        {:else if songsError}
          <h3 class="stat-value">Unavailable</h3>
          <p class="card-description">Statistics could not be loaded.</p>
        {:else}
          <h3 class="stat-value">{draftCount}</h3>
          <p class="card-description">
            Songs not yet published.
          </p>
        {/if}
      </article>

      <article class="stat-card">
        <span class="stat-icon" aria-hidden="true">◎</span>
        <p class="card-label">Published songs</p>

        {#if songsLoading}
          <h3 class="stat-value">Loading...</h3>
          <p class="card-description">Retrieving publication status.</p>
        {:else if songsError}
          <h3 class="stat-value">Unavailable</h3>
          <p class="card-description">Statistics could not be loaded.</p>
        {:else}
          <h3 class="stat-value">{publishedCount}</h3>
          <p class="card-description">
            Songs marked as published.
          </p>
        {/if}

        <p class="card-footnote">
          Public playback is a separate future milestone.
        </p>
      </article>

      <article class="stat-card">
        <span class="stat-icon" aria-hidden="true">◈</span>
        <p class="card-label">Classifications</p>

        {#if classificationsLoading}
          <h3 class="stat-value">Loading...</h3>
          <p class="card-description">Retrieving classifications.</p>
        {:else if classificationsError}
          <h3 class="stat-value">Unavailable</h3>
          <p class="card-description">{classificationsError}</p>
        {:else}
          <h3 class="stat-value">{classificationsCount}</h3>
          <p class="card-description">
            Language, genre, mood and category options.
          </p>
        {/if}

        <a class="card-link" href="/admin/classifications">
          Manage classifications →
        </a>
      </article>
    </div>
  </section>

  <section class="workspace-section">
    <div class="section-heading">
      <h2>Quick actions</h2>
      <p>Shortcuts to your main management tasks.</p>
    </div>

    <div class="actions-grid">
      <a class="action-card" href="/admin/upload">
        <span class="action-icon" aria-hidden="true">↑</span>
        <span class="action-copy">
          <strong>Upload a song</strong>
          <span>Add an MP3 and its metadata to your archive.</span>
        </span>
        <span class="action-arrow" aria-hidden="true">→</span>
      </a>

      <a class="action-card" href="/admin/songs">
        <span class="action-icon" aria-hidden="true">♫</span>
        <span class="action-copy">
          <strong>Music Library</strong>
          <span>Review songs and correct existing metadata.</span>
        </span>
        <span class="action-arrow" aria-hidden="true">→</span>
      </a>

      <a class="action-card" href="/admin/classifications">
        <span class="action-icon" aria-hidden="true">◈</span>
        <span class="action-copy">
          <strong>Manage classifications</strong>
          <span>Maintain genres, moods and categories.</span>
        </span>
        <span class="action-arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </section>

  <section class="recent-section" aria-labelledby="recent-heading">
    <div class="section-heading">
      <h2 id="recent-heading">Your music collection</h2>
      <a class="section-link" href="/admin/songs">
        View Music Library →
      </a>
    </div>

    {#if songsLoading}
      <div class="state-panel">
        Loading your music collection...
      </div>
    {:else if songsError}
      <div class="state-panel error-state" role="alert">
        {songsError}
      </div>
    {:else if songs.length === 0}
      <div class="state-panel">
        <span class="empty-icon" aria-hidden="true">♫</span>
        <h3>Your library is waiting for its first song.</h3>
        <p>
          Upload a track to begin building your collection.
        </p>
        <a class="primary-action" href="/admin/upload">
          Upload your first song
        </a>
      </div>
    {:else}
      <div class="recent-list">
        {#each songs.slice(0, 4) as song (song.id)}
          <div class="recent-song">
            <span class="song-icon" aria-hidden="true">♫</span>

            <div class="song-details">
              <strong>{song.title}</strong>
              <span>{song.artist}</span>
            </div>

            <span
              class="status"
              class:published={song.isPublished}
            >
              {song.isPublished ? "Published" : "Draft"}
            </span>

            <a
              class="song-edit-link"
              href="/admin/songs"
              aria-label={`Open Music Library to manage ${song.title}`}
            >
              Manage
            </a>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="storage-panel">
    <span class="storage-icon" aria-hidden="true">☁</span>

    <div class="storage-copy">
      <h2>Cloud audio storage</h2>
      <p>
        Your uploaded audio files are stored in the private
        Cloudflare R2 bucket.
      </p>
      <span class="storage-detail">
        Bucket: music-archive-audio
      </span>
    </div>

    <span class="configured-badge">Configured</span>
  </section>
</div>

<style>
  .overview {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
    padding: 30px 36px 44px;
  }

  .welcome-panel {
    display: flex;
    min-height: 210px;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 32px;
    border: 1px solid #3b3540;
    border-radius: 15px;
    background:
      radial-gradient(
        ellipse at 85% 20%,
        rgb(217 184 123 / 13%),
        transparent 44%
      ),
      linear-gradient(110deg, #191e2d, #171c2a);
  }

  .eyebrow {
    margin: 0 0 13px;
    color: #d9b87b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }

  .welcome-panel h2 {
    margin: 0 0 10px;
    font-size: clamp(23px, 3vw, 30px);
    font-weight: 600;
    letter-spacing: -0.04em;
  }

  .welcome-panel p:not(.eyebrow) {
    margin: 0 0 23px;
    color: #aab4c6;
    font-size: 13px;
    line-height: 1.7;
  }

  .welcome-icon {
    display: grid;
    width: 80px;
    height: 80px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(217 184 123 / 23%);
    border-radius: 22px;
    background: rgb(217 184 123 / 8%);
    color: #d9b87b;
    font-size: 43px;
  }

  .primary-action {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 10px 15px;
    border: 1px solid #d9b87b;
    border-radius: 7px;
    background: #d9b87b;
    color: #151a28;
    font-size: 11px;
    font-weight: 650;
    text-decoration: none;
    transition: background 120ms ease;
  }

  .primary-action:hover {
    background: #f0d29b;
  }

  .section-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 34px 0 17px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .section-heading > p {
    margin: 0;
    color: #929cb1;
    font-size: 11px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 17px;
  }

  .stat-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    padding: 21px;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
  }

  .stat-icon,
  .action-icon,
  .song-icon {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    border-radius: 9px;
    background: #252737;
    color: #d9b87b;
  }

  .stat-icon {
    width: 35px;
    height: 35px;
    font-size: 19px;
  }

  .card-label {
    margin: 17px 0 7px;
    color: #aab4c6;
    font-size: 12px;
  }

  .stat-value {
    margin: 0 0 6px;
    color: #f0f2f8;
    font-size: 25px;
    font-weight: 650;
  }

  .card-description {
    margin: 0;
    color: #929cb1;
    font-size: 11px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .card-footnote {
    margin: 8px 0 0;
    color: #808ba1;
    font-size: 10px;
    line-height: 1.6;
  }

  .card-link,
  .section-link {
    margin-top: 16px;
    color: #e4c58e;
    font-size: 11px;
    text-decoration: none;
    text-underline-offset: 3px;
  }

  .card-link:hover,
  .section-link:hover {
    text-decoration: underline;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 11px;
  }

  .action-card {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
    padding: 17px;
    border: 1px solid #293144;
    border-radius: 10px;
    background: #111827;
    color: inherit;
    text-decoration: none;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .action-card:hover {
    border-color: #716249;
    background: #151e2e;
  }

  .action-icon {
    width: 40px;
    height: 40px;
    font-size: 21px;
  }

  .action-copy {
    display: grid;
    flex: 1;
    gap: 5px;
  }

  .action-copy strong {
    color: #eef1f7;
    font-size: 12px;
    font-weight: 600;
  }

  .action-copy > span {
    color: #929cb1;
    font-size: 11px;
    line-height: 1.6;
  }

  .action-arrow {
    color: #d9b87b;
    font-size: 17px;
  }

  .recent-list {
    overflow: hidden;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
  }

  .recent-song {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 13px;
    padding: 15px 18px;
    border-bottom: 1px solid #293144;
  }

  .recent-song:last-child {
    border-bottom: 0;
  }

  .song-icon {
    width: 40px;
    height: 40px;
    font-size: 19px;
  }

  .song-details {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 5px;
  }

  .song-details strong {
    overflow: hidden;
    color: #eef1f7;
    font-size: 12px;
    text-overflow: ellipsis;
  }

  .song-details > span {
    overflow: hidden;
    color: #929cb1;
    font-size: 10px;
    text-overflow: ellipsis;
  }

  .status {
    flex-shrink: 0;
    padding: 5px 8px;
    border: 1px solid #68533a;
    border-radius: 20px;
    background: #30271e;
    color: #e5bd81;
    font-size: 10px;
  }

  .status.published {
    border-color: #305a4b;
    background: #1c342e;
    color: #a5dfc2;
  }

  .song-edit-link {
    flex-shrink: 0;
    color: #e4c58e;
    font-size: 10px;
    text-decoration: none;
  }

  .song-edit-link:hover {
    text-decoration: underline;
  }

  .state-panel {
    display: flex;
    min-height: 120px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 25px;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
    color: #aab4c6;
    font-size: 12px;
    text-align: center;
  }

  .state-panel h3,
  .state-panel p {
    margin: 0;
  }

  .state-panel h3 {
    color: #eef1f7;
    font-size: 14px;
  }

  .state-panel p {
    font-size: 11px;
    line-height: 1.7;
  }

  .empty-icon {
    color: #d9b87b;
    font-size: 30px;
  }

  .state-panel.error-state {
    border-color: #713b43;
    color: #ffb5ba;
  }

  .storage-panel {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-top: 26px;
    padding: 19px;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
  }

  .storage-icon {
    display: grid;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 9px;
    background: #252737;
    color: #d9b87b;
    font-size: 22px;
  }

  .storage-copy {
    min-width: 0;
    flex: 1;
  }

  .storage-copy h2 {
    margin: 0 0 5px;
    font-size: 12px;
    font-weight: 600;
  }

  .storage-copy p {
    margin: 0;
    color: #aab4c6;
    font-size: 11px;
    line-height: 1.7;
  }

  .storage-detail {
    display: block;
    margin-top: 6px;
    color: #808ba1;
    font-size: 10px;
    overflow-wrap: anywhere;
  }

  .configured-badge {
    flex-shrink: 0;
    padding: 6px 9px;
    border: 1px solid #305a4b;
    border-radius: 20px;
    background: #1c342e;
    color: #a5dfc2;
    font-size: 10px;
  }

  @media (min-width: 1000px) {
    .stats-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .actions-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .overview {
      padding: 22px 15px 30px;
    }

    .welcome-panel {
      min-height: 180px;
      padding: 23px 20px;
    }

    .welcome-icon {
      width: 55px;
      height: 55px;
      border-radius: 15px;
      font-size: 30px;
    }

    .section-heading {
      align-items: flex-start;
    }

    .recent-song {
      gap: 9px;
      padding: 13px 10px;
    }

    .song-icon {
      width: 34px;
      height: 34px;
    }

    .status {
      font-size: 9px;
    }

    .storage-panel {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .configured-badge {
      margin-left: 55px;
    }
  }

  @media (max-width: 420px) {
    .welcome-icon {
      display: none;
    }

    .welcome-panel h2 {
      font-size: 23px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .recent-song {
      flex-wrap: wrap;
    }

    .song-details {
      flex-basis: calc(100% - 55px);
    }

    .song-edit-link {
      margin-left: auto;
    }
  }
</style>

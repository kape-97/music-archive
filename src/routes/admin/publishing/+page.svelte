
<script>
  import { getContext } from "svelte";

  import {
    createPlayerController,
    PLAYER_CONTEXT_KEY
  } from "#lib/player/player-controller.svelte.js";

  /** @type {import('./$types').PageProps} */
  let { data } = $props();

  /** @type {ReturnType<typeof createPlayerController>} */
  const player = getContext(PLAYER_CONTEXT_KEY);

  let songs = $derived([...data.songs]);
  let searchTerm = $state("");
  let statusFilter = $state("ALL");
  let currentPage = $state(1);

  const PAGE_SIZE = 10;

  /** @type {import('./$types').PageData['songs'][number] | null} */
  let confirmationSong = $state(null);

  let isSubmitting = $state(false);
  let actionError = $state("");
  let actionSuccess = $state("");

  const totalSongs = $derived(songs.length);

  const draftCount = $derived(
    songs.filter(
      (song) => !song.isPublished && !song.deletionPending
    ).length
  );

  const publishedCount = $derived(
    songs.filter(
      (song) => song.isPublished && !song.deletionPending
    ).length
  );

  const pendingDeletionCount = $derived(
    songs.filter((song) => song.deletionPending).length
  );

  /**
   * Check whether a song is the currently selected player track.
   *
   * @param {number} songId
   * @returns {boolean}
   */
  function isCurrentTrack(songId) {
    return player.state.currentTrack?.id === songId;
  }

  /**
   * Check whether a particular song is currently playing.
   *
   * @param {number} songId
   * @returns {boolean}
   */
  function isPlayingSong(songId) {
    return isCurrentTrack(songId) && player.state.isPlaying;
  }

  /**
   * Send a Publishing page song to the shared playback controller.
   *
   * The browser receives application endpoint URLs only.
   * R2 object keys remain server-side.
   *
   * @param {number} songId
   * @returns {Promise<boolean> | undefined}
   */
  function togglePlayback(songId) {
    const song = songs.find((entry) => entry.id === songId);

    if (!song || song.deletionPending) {
      return;
    }

    return player.toggleTrack({
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioUrl: `/api/admin/songs/${song.id}/audio`,
      coverUrl: song.hasCover
        ? `/api/admin/songs/${song.id}/cover`
        : null,
      deletionPending: song.deletionPending
    });
  }

  /**
   * Get the first classification name matching the requested type.
   *
   * @param {import('./$types').PageData['songs'][number]} song
   * @param {"LANGUAGE" | "GENRE"} type
   * @returns {string}
   */
  function getClassificationName(song, type) {
    return (
      song.classifications?.find(
        (entry) => entry.classification.type === type
      )?.classification.name || "—"
    );
  }

  /**
   * Filter songs by search term and publication state.
   */
  const filteredSongs = $derived(
    songs.filter((song) => {
      const term = searchTerm.trim().toLocaleLowerCase();

      if (term) {
        const matches = [
          song.title,
          song.artist,
          song.album ?? ""
        ].some((value) =>
          value.toLocaleLowerCase().includes(term)
        );

        if (!matches) return false;
      }

      // Pending-deletion songs remain visible in All songs.
      if (statusFilter === "DRAFT") {
        return !song.isPublished && !song.deletionPending;
      }

      if (statusFilter === "PUBLISHED") {
        return song.isPublished && !song.deletionPending;
      }

      return true;
    })
  );

  const totalPages = $derived(
    Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE))
  );

  const displayedPage = $derived(
    Math.min(currentPage, totalPages)
  );

  const resultStart = $derived(
    filteredSongs.length === 0
      ? 0
      : (displayedPage - 1) * PAGE_SIZE + 1
  );

  const resultEnd = $derived(
    Math.min(
      displayedPage * PAGE_SIZE,
      filteredSongs.length
    )
  );

  const visibleSongs = $derived(
    filteredSongs.slice(
      (displayedPage - 1) * PAGE_SIZE,
      displayedPage * PAGE_SIZE
    )
  );

  /**
   * Reset pagination when the search changes.
   */
  function resetPagination() {
    currentPage = 1;
  }

  /**
   * Change the active publication filter.
   *
   * @param {string} filter
   */
  function selectFilter(filter) {
    statusFilter = filter;
    currentPage = 1;
    actionError = "";
    actionSuccess = "";
  }

  /**
   * Open the publication confirmation panel.
   *
   * @param {import('./$types').PageData['songs'][number]} song
   */
  function requestPublicationChange(song) {
    if (song.deletionPending || isSubmitting) {
      return;
    }

    confirmationSong = song;
    actionError = "";
    actionSuccess = "";
  }

  /**
   * Close the confirmation panel.
   */
  function cancelPublicationChange() {
    if (isSubmitting) return;

    confirmationSong = null;
    actionError = "";
  }

  /**
   * Send the requested publication transition to the protected API.
   */
  async function confirmPublicationChange() {
    const song = confirmationSong;

    if (!song || isSubmitting || song.deletionPending) {
      return;
    }

    const requestedState = !song.isPublished;

    isSubmitting = true;
    actionError = "";
    actionSuccess = "";

    try {
      const response = await fetch(
        `/api/admin/songs/${song.id}/publication`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "same-origin",
          body: JSON.stringify({
            isPublished: requestedState
          })
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        actionError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to update publication status.";

        return;
      }

      // Validate the server-confirmed response before updating the UI.
      if (
        result?.song?.id !== song.id ||
        result.song.isPublished !== requestedState
      ) {
        actionError =
          "The server response could not be verified. Refresh the page before trying again.";

        return;
      }

      // Update local state only after server confirmation.
      songs = songs.map((entry) =>
        entry.id === song.id
          ? {
              ...entry,
              isPublished: result.song.isPublished
            }
          : entry
      );

      confirmationSong = null;

      const newStatus = requestedState
        ? "Published"
        : "Draft";

      actionSuccess = result.unchanged
        ? `"${song.title}" was already ${newStatus}.`
        : `"${song.title}" is now ${newStatus}.`;

    } catch (error) {
      console.error("Publication request failed:", error);

      actionError =
        "Unable to contact the server. Refresh the page and check the song's status.";

    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Publishing | Music Archive</title>
  <meta
    name="description"
    content="Manage song publication in Music Archive."
  />
</svelte:head>

<div class="publishing-content">

  <!-- PAGE INTRODUCTION -->
  <section class="page-intro">
    <div>
      <p class="eyebrow">CATALOGUE MANAGEMENT</p>

      <h2>Manage Publishing</h2>

      <p>
        Control which songs are eligible for your public music catalogue.
      </p>
    </div>

    <div class="total-card">
      <span>Total songs</span>
      <strong>{totalSongs}</strong>
    </div>
  </section>

  <!-- PUBLICATION SUMMARY -->
  <section class="summary-grid" aria-label="Publication summary">

    <!-- DRAFT SONGS -->
    <article class="summary-card">
      <div class="summary-icon draft-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h3" />
          <path d="M8 17h3" />
          <path d="m15 17 4-4 2 2-4 4-3 1z" />
        </svg>
      </div>

      <div class="summary-card-copy">
        <span>Draft songs</span>
        <small>Not publicly available</small>
      </div>

      <strong class="summary-count">{draftCount}</strong>
    </article>

    <!-- PUBLISHED SONGS -->
    <article class="summary-card">
      <div class="summary-icon published-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16.5 8" />
        </svg>
      </div>

      <div class="summary-card-copy">
        <span>Published songs</span>
        <small>Eligible for public catalogue</small>
      </div>

      <strong class="summary-count">{publishedCount}</strong>
    </article>

    <!-- PENDING DELETION -->
    <article class="summary-card">
      <div class="summary-icon pending-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="m19 6-1 14H6L5 6" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      </div>

      <div class="summary-card-copy">
        <span>Pending deletion</span>
        <small>Publication unavailable</small>
      </div>

      <strong class="summary-count">{pendingDeletionCount}</strong>
    </article>

  </section>

  <!-- FEEDBACK -->
  {#if actionError}
    <div class="message error-message" role="alert">
      {actionError}
    </div>
  {/if}

  {#if actionSuccess}
    <div class="message success-message" role="status">
      {actionSuccess}
    </div>
  {/if}

  <!-- CONFIRMATION PANEL -->
  {#if confirmationSong}
    <section
      class="confirmation-panel"
      aria-labelledby="confirmation-heading"
    >
      <div class="confirmation-header">
        <div>
          <p class="eyebrow">PUBLICATION CONFIRMATION</p>

          <h2 id="confirmation-heading">
            {confirmationSong.isPublished
              ? "Unpublish this song?"
              : "Publish this song?"}
          </h2>
        </div>

        <span
          class="status"
          class:published={confirmationSong.isPublished}
        >
          {confirmationSong.isPublished
            ? "Published"
            : "Draft"}
        </span>
      </div>

      <div class="confirmation-song">
        {#if confirmationSong.hasCover}
          <img
            src={`/api/admin/songs/${confirmationSong.id}/cover`}
            alt={`Artwork for ${confirmationSong.title}`}
          />
        {:else}
          <span class="cover-placeholder" aria-hidden="true">
            ♫
          </span>
        {/if}

        <div>
          <strong>{confirmationSong.title}</strong>
          <span>{confirmationSong.artist}</span>
          <small>{confirmationSong.album || "No album"}</small>
        </div>
      </div>

      <p class="confirmation-description">
        {#if confirmationSong.isPublished}
          This song will be marked as Draft and will no longer be
          eligible for the public catalogue.
        {:else}
          This song will be marked as Published and become eligible
          for the public catalogue.
        {/if}
      </p>

      <div class="confirmation-actions">
        <button
          class="secondary-button"
          type="button"
          onclick={cancelPublicationChange}
          disabled={isSubmitting}
        >
          Cancel
        </button>

        <button
          class="primary-button"
          class:warning-button={confirmationSong.isPublished}
          type="button"
          onclick={confirmPublicationChange}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Updating..."
            : confirmationSong.isPublished
              ? "Confirm Unpublish"
              : "Confirm Publish"}
        </button>
      </div>
    </section>
  {/if}

  <!-- SONG MANAGEMENT -->
  <section class="publishing-panel">

    <div class="panel-heading">
      <div>
        <h2>Song publication</h2>

        <p>
          Select a song to change its publication status.
        </p>
      </div>

      <span class="record-count">
        {filteredSongs.length}
        {filteredSongs.length === 1 ? "song" : "songs"}
      </span>
    </div>

    <!-- SEARCH -->
    <div class="toolbar">

      <div class="search-control">
        <label for="publication-search">Search songs</label>

        <input
          id="publication-search"
          type="search"
          bind:value={searchTerm}
          oninput={resetPagination}
          placeholder="Search by song title, artist or album..."
        />
      </div>

      <!-- STATUS FILTERS -->
      <div class="filter-area">
        <span class="filter-label">Publication status</span>

        <div
          class="status-tabs"
          role="group"
          aria-label="Filter songs by publication status"
        >
          <button
            type="button"
            class:active={statusFilter === "ALL"}
            aria-pressed={statusFilter === "ALL"}
            onclick={() => selectFilter("ALL")}
          >
            All songs
            <span>{totalSongs}</span>
          </button>

          <button
            type="button"
            class:active={statusFilter === "DRAFT"}
            aria-pressed={statusFilter === "DRAFT"}
            onclick={() => selectFilter("DRAFT")}
          >
            Draft
            <span>{draftCount}</span>
          </button>

          <button
            type="button"
            class:active={statusFilter === "PUBLISHED"}
            aria-pressed={statusFilter === "PUBLISHED"}
            onclick={() => selectFilter("PUBLISHED")}
          >
            Published
            <span>{publishedCount}</span>
          </button>
        </div>
      </div>

    </div>

    <p class="filter-note">
      Songs pending deletion remain visible under All songs.
      Publication actions are disabled for those songs.
    </p>

    <!-- EMPTY AND TABLE STATES -->
    {#if totalSongs === 0}

      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">♫</span>

        <h3>No songs in your archive</h3>

        <p>
          Upload songs before managing their publication status.
        </p>

        <a class="primary-button link-button" href="/admin/upload">
          Upload a song
        </a>
      </div>

    {:else if filteredSongs.length === 0}

      <div class="empty-state">
        <h3>No matching songs</h3>

        <p>
          Try another search term or select a different publication filter.
        </p>

        <button
          class="secondary-button"
          type="button"
          onclick={() => {
            searchTerm = "";
            selectFilter("ALL");
          }}
        >
          Clear filters
        </button>
      </div>

    {:else}

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="song-column" scope="col">Song</th>
              <th scope="col">Language</th>
              <th scope="col">Genre</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>

          <tbody>
            {#each visibleSongs as song (song.id)}
              <tr>

                <!-- SONG DETAILS -->
                <td>
                  <div class="song-info">

                    {#if song.hasCover}
                      <img
                        class="song-cover"
                        src={`/api/admin/songs/${song.id}/cover`}
                        alt={`Cover artwork for ${song.title}`}
                        loading="lazy"
                      />
                    {:else}
                      <span class="cover-placeholder" aria-hidden="true">
                        ♫
                      </span>
                    {/if}

                    <div class="song-details">
                      <strong>{song.title}</strong>

                      <span>{song.artist}</span>

                      <!-- SHARED PLAYER CONTROL -->
                      <div class="song-player">
                        <button
                          class="player-play-button"
                          class:playing={isPlayingSong(song.id)}
                          type="button"
                          onclick={() => togglePlayback(song.id)}
                          disabled={song.deletionPending}
                          aria-label={isPlayingSong(song.id)
                            ? `Pause ${song.title}`
                            : `Play ${song.title}`}
                          aria-pressed={isPlayingSong(song.id)}
                        >
                          {#if isPlayingSong(song.id)}
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M7 5h4v14H7zM13 5v14h4V5z" />
                            </svg>
                          {:else}
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M8 5.5v13L19 12z" />
                            </svg>
                          {/if}
                        </button>
                      </div>

                      {#if isCurrentTrack(song.id) && player.state.errorMessage}
                        <p class="player-error" role="alert">
                          {player.state.errorMessage}
                        </p>
                      {/if}
                    </div>

                  </div>
                </td>

                <!-- LANGUAGE -->
                <td>
                  <span class="classification-name">
                    {getClassificationName(song, "LANGUAGE")}
                  </span>
                </td>

                <!-- GENRE -->
                <td>
                  <span class="classification-name">
                    {getClassificationName(song, "GENRE")}
                  </span>
                </td>

                <!-- STATUS -->
                <td>
                  <span
                    class="status"
                    class:published={song.isPublished && !song.deletionPending}
                    class:pending={song.deletionPending}
                  >
                    {song.deletionPending
                      ? "Pending deletion"
                      : song.isPublished
                        ? "Published"
                        : "Draft"}
                  </span>
                </td>

                <!-- PUBLICATION ACTION -->
                <td>
                  {#if song.deletionPending}

                    <button
                      class="disabled-action"
                      type="button"
                      disabled
                      title="This song is pending deletion"
                    >
                      Unavailable
                    </button>

                  {:else}

                    <button
                      class="publication-button"
                      class:unpublish-button={song.isPublished}
                      type="button"
                      onclick={() => requestPublicationChange(song)}
                      disabled={isSubmitting || confirmationSong !== null}
                      aria-label={`${song.isPublished ? "Unpublish" : "Publish"} ${song.title}`}
                    >
                      {song.isPublished ? "Unpublish" : "Publish"}
                    </button>

                  {/if}
                </td>

              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- PAGINATION -->
      <div class="pagination-bar">

        <p class="result-summary">
          Showing
          <strong>{resultStart}–{resultEnd}</strong>
          of
          <strong>{filteredSongs.length}</strong>
          songs
        </p>

        <div class="pagination-controls">

          <button
            class="pagination-button"
            type="button"
            onclick={() => {
              currentPage = Math.max(1, displayedPage - 1);
            }}
            disabled={displayedPage <= 1}
          >
            Previous
          </button>

          <span class="page-indicator">
            Page <strong>{displayedPage}</strong> of
            <strong>{totalPages}</strong>
          </span>

          <button
            class="pagination-button"
            type="button"
            onclick={() => {
              currentPage = Math.min(totalPages, displayedPage + 1);
            }}
            disabled={displayedPage >= totalPages}
          >
            Next
          </button>

        </div>
      </div>

    {/if}

  </section>
</div>

<style>
  /* PAGE LAYOUT */

  .publishing-content {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 30px 32px 44px;
  }

  .page-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 25px;
  }

  .eyebrow {
    margin: 0 0 9px;
    color: #d9b87b;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }

  .page-intro h2 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 650;
    letter-spacing: -0.025em;
  }

  .page-intro p:not(.eyebrow) {
    margin: 0;
    color: #aab4c6;
    font-size: 13px;
    line-height: 1.7;
  }

  .total-card {
    min-width: 125px;
    padding: 14px 18px;
    border: 1px solid #343c50;
    border-radius: 10px;
    background: #111827;
  }

  .total-card span,
  .total-card strong {
    display: block;
  }

  .total-card span {
    color: #9ba6bb;
    font-size: 12px;
  }

  .total-card strong {
    margin-top: 7px;
    font-size: 26px;
  }

  /* PUBLICATION SUMMARY */

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 15px;
    margin-bottom: 24px;
  }

  .summary-card {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    min-width: 0;
    min-height: 88px;
    padding: 17px 19px;
    border: 1px solid #293144;
    border-radius: 10px;
    background: #111827;
  }

  .summary-icon {
    display: grid;
    width: 46px;
    height: 46px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 10px;
  }

  .summary-icon svg {
    display: block;
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .draft-icon {
    background: #352d27;
    color: #e3bd81;
  }

  .published-icon {
    background: #1e382f;
    color: #8bc9a9;
  }

  .pending-icon {
    background: #382932;
    color: #e3a2a6;
  }

  .summary-card-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  .summary-card-copy span {
    color: #d6dceb;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .summary-card-copy small {
    color: #8994aa;
    font-size: 11px;
    line-height: 1.5;
  }

  .summary-count {
    color: #f0f2f7;
    font-size: 25px;
    font-weight: 700;
    line-height: 1;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* FEEDBACK */

  .message {
    margin-bottom: 17px;
    padding: 14px 16px;
    border: 1px solid;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .error-message {
    border-color: #713b43;
    background: #321d28;
    color: #ffb5ba;
  }

  .success-message {
    border-color: #305a4b;
    background: #1c342e;
    color: #a5dfc2;
  }

  /* CONFIRMATION */

  .confirmation-panel {
    margin-bottom: 23px;
    padding: 22px;
    border: 1px solid #6a5838;
    border-radius: 11px;
    background: #171d2a;
  }

  .confirmation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
  }

  .confirmation-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .confirmation-song {
    display: flex;
    align-items: flex-start;
    gap: 13px;
    margin-top: 19px;
    padding: 14px;
    border: 1px solid #343c50;
    border-radius: 8px;
    background: #0d1422;
  }

  .confirmation-song img,
  .confirmation-song .cover-placeholder {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border-radius: 7px;
    object-fit: cover;
  }

  .confirmation-song div {
    min-width: 0;
  }

  .confirmation-song strong,
  .confirmation-song span,
  .confirmation-song small {
    display: block;
    overflow-wrap: anywhere;
  }

  .confirmation-song strong {
    color: #eef1f7;
    font-size: 14px;
    line-height: 1.5;
  }

  .confirmation-song span,
  .confirmation-song small {
    margin-top: 5px;
    color: #aab4c6;
    font-size: 12px;
    line-height: 1.5;
  }

  .confirmation-description {
    margin: 16px 0;
    color: #bac3d2;
    font-size: 13px;
    line-height: 1.7;
  }

  .confirmation-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  /* MAIN PANEL */

  .publishing-panel {
    overflow: hidden;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 22px 23px;
    border-bottom: 1px solid #293144;
  }

  .panel-heading h2 {
    margin: 0 0 7px;
    font-size: 17px;
    font-weight: 650;
  }

  .panel-heading p {
    margin: 0;
    color: #929cb1;
    font-size: 12px;
    line-height: 1.6;
  }

  .record-count {
    padding: 7px 11px;
    border-radius: 20px;
    background: #252e41;
    color: #dce2ed;
    font-size: 12px;
    white-space: nowrap;
  }

  /* SEARCH AND FILTERS */

  .toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    align-items: end;
    gap: 24px;
    padding: 21px;
    border-bottom: 1px solid #293144;
  }

  .search-control {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 9px;
  }

  .search-control label,
  .filter-label {
    color: #d6dceb;
    font-size: 13px;
    font-weight: 600;
  }

  .search-control input {
    width: 100%;
    min-height: 43px;
    padding: 10px 13px;
    border: 1px solid #394258;
    border-radius: 7px;
    outline: none;
    background: #0c1322;
    color: #eef1f7;
    color-scheme: dark;
    font: inherit;
    font-size: 13px;
  }

  .search-control input::placeholder {
    color: #7f8ba2;
  }

  .search-control input:focus {
    border-color: #d9b87b;
    box-shadow: 0 0 0 2px rgb(217 184 123 / 12%);
  }

  .filter-area {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .status-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .status-tabs button {
    display: flex;
    min-height: 38px;
    align-items: center;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: #aab4c6;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .status-tabs button:hover {
    background: #1b2638;
    color: #f0d29b;
  }

  .status-tabs button.active {
    border-color: #594d37;
    background: #302a26;
    color: #f0d29b;
  }

  .status-tabs button span {
    color: #aab4c6;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .status-tabs button:focus-visible,
  .publication-button:focus-visible,
  .pagination-button:focus-visible,
  .primary-button:focus-visible,
  .secondary-button:focus-visible,
  .player-play-button:focus-visible {
    outline: 2px solid #d9b87b;
    outline-offset: 3px;
  }

  .filter-note {
    margin: 0;
    padding: 13px 21px;
    border-bottom: 1px solid #293144;
    color: #929cb1;
    font-size: 12px;
    line-height: 1.6;
  }

  /* TABLE */

  .table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 900px;
    border-collapse: collapse;
    text-align: left;
  }

  th {
    padding: 14px 15px;
    background: #151e2f;
    color: #b8c2d4;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  th.song-column {
    width: 43%;
  }

  th:nth-child(2),
  th:nth-child(3) {
    width: 14%;
  }

  th:nth-child(4) {
    width: 16%;
  }

  th:nth-child(5) {
    width: 145px;
  }

  td {
    padding: 16px 15px;
    border-top: 1px solid #293144;
    color: #dbe1eb;
    font-size: 13px;
    vertical-align: middle;
  }

  tbody tr {
    transition: background 120ms ease;
  }

  tbody tr:nth-child(even) {
    background: #151e2f;
  }

  tbody tr:hover {
    background: #1b2638;
  }

  /* SONG DETAILS */

  .song-info {
    display: flex;
    min-width: 220px;
    align-items: flex-start;
    gap: 13px;
  }

  .song-cover,
  .cover-placeholder {
    display: grid;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid #394258;
    border-radius: 7px;
    object-fit: cover;
  }

  .cover-placeholder {
    background: #252d3e;
    color: #d9b87b;
    font-size: 25px;
  }

  .song-details {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }

  .song-details strong,
  .song-details span {
    display: block;
    max-width: 100%;
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
  }

  .song-details strong {
    color: #eef1f7;
    font-size: 15px;
    font-weight: 650;
    line-height: 1.5;
  }

  .song-details span {
    color: #aab4c6;
    font-size: 13px;
    line-height: 1.5;
  }

  .classification-name {
    display: block;
    color: #c1cada;
    font-size: 12px;
    line-height: 1.6;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  /* SHARED PLAYER */

  .song-player {
    display: flex;
    width: fit-content;
    align-items: center;
    margin-top: 8px;
  }

  .player-play-button {
    display: grid;
    width: 35px;
    height: 35px;
    flex-shrink: 0;
    place-items: center;
    padding: 0;
    border: 1px solid #d9b87b;
    border-radius: 50%;
    background: #d9b87b;
    color: #151a28;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      transform 150ms ease;
  }

  .player-play-button:hover:not(:disabled) {
    border-color: #f0d29b;
    background: #f0d29b;
    transform: translateY(-1px);
  }

  .player-play-button.playing {
    background: #f0d29b;
  }

  .player-play-button svg {
    display: block;
    width: 17px;
    height: 17px;
    fill: currentColor;
  }

  .player-play-button:not(.playing) svg {
    margin-left: 2px;
  }

  .player-play-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .player-error {
    max-width: 260px;
    margin: 7px 0 0;
    color: #ffb5ba;
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  /* STATUS */

  .status {
    display: inline-flex;
    min-height: 27px;
    align-items: center;
    padding: 5px 10px;
    border: 1px solid #615039;
    border-radius: 20px;
    background: #322c26;
    color: #e7c58d;
    font-size: 12px;
    font-weight: 550;
    white-space: nowrap;
  }

  .status.published {
    border-color: #315d4c;
    background: #1d342d;
    color: #a4d8bc;
  }

  .status.pending {
    border-color: #70464a;
    background: #38262d;
    color: #e6adb0;
  }

  /* PUBLICATION ACTIONS */

  .publication-button,
  .disabled-action {
    min-width: 100px;
    min-height: 37px;
    padding: 8px 12px;
    border: 1px solid #927342;
    border-radius: 7px;
    background: #d9b87b;
    color: #18202d;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
  }

  .publication-button:hover:not(:disabled) {
    background: #ebcb93;
  }

  .publication-button.unpublish-button {
    border-color: #765c3d;
    background: #282b35;
    color: #e8c28d;
  }

  .publication-button.unpublish-button:hover:not(:disabled) {
    border-color: #d9b87b;
    background: #36313a;
  }

  .publication-button:disabled {
    cursor: wait;
    opacity: 0.5;
  }

  .disabled-action {
    border-color: #394258;
    background: #252d3e;
    color: #8793a9;
    cursor: not-allowed;
  }

  /* GENERAL BUTTONS */

  .primary-button,
  .secondary-button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    padding: 10px 15px;
    border-radius: 7px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }

  .primary-button {
    border: 1px solid #d9b87b;
    background: #d9b87b;
    color: #171d29;
  }

  .primary-button:hover:not(:disabled) {
    background: #ebcb93;
  }

  .primary-button.warning-button {
    border-color: #806143;
    background: #302a27;
    color: #e7c08a;
  }

  .primary-button.warning-button:hover:not(:disabled) {
    border-color: #d9b87b;
    background: #3a3030;
  }

  .secondary-button {
    border: 1px solid #40495c;
    background: transparent;
    color: #dce2ed;
  }

  .secondary-button:hover:not(:disabled) {
    border-color: #d9b87b;
    color: #f0d29b;
  }

  .primary-button:disabled,
  .secondary-button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .link-button {
    margin-top: 12px;
  }

  /* EMPTY STATE */

  .empty-state {
    display: flex;
    min-height: 260px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    text-align: center;
  }

  .empty-icon {
    margin-bottom: 14px;
    color: #d9b87b;
    font-size: 38px;
  }

  .empty-state h3 {
    margin: 0 0 10px;
    font-size: 18px;
  }

  .empty-state p {
    max-width: 420px;
    margin: 0;
    color: #aab4c6;
    font-size: 13px;
    line-height: 1.7;
  }

  /* PAGINATION */

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 17px 20px;
    border-top: 1px solid #293144;
  }

  .result-summary {
    margin: 0;
    color: #aab4c6;
    font-size: 12px;
  }

  .result-summary strong {
    color: #e0e6f0;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pagination-button {
    min-height: 35px;
    padding: 7px 11px;
    border: 1px solid #394258;
    border-radius: 6px;
    background: #151e2f;
    color: #dce2ed;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .pagination-button:hover:not(:disabled) {
    border-color: #d9b87b;
    color: #f0d29b;
  }

  .pagination-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .page-indicator {
    color: #aab4c6;
    font-size: 12px;
    white-space: nowrap;
  }

  .page-indicator strong {
    color: #eef1f7;
  }

  /* RESPONSIVE */

  @media (max-width: 1000px) {
    .toolbar {
      grid-template-columns: 1fr;
      gap: 18px;
    }

    .filter-area {
      align-items: flex-start;
    }

    table {
      min-width: 900px;
    }
  }

  @media (max-width: 760px) {
    .publishing-content {
      padding: 22px 15px 35px;
    }

    .summary-grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .summary-card {
      grid-template-columns: 46px minmax(0, 1fr) auto;
    }

    .page-intro {
      align-items: flex-start;
    }

    .panel-heading,
    .toolbar {
      padding-right: 15px;
      padding-left: 15px;
    }

    .pagination-bar {
      align-items: flex-start;
      flex-direction: column;
      padding: 16px;
    }
  }

  @media (max-width: 480px) {
    .page-intro {
      flex-wrap: wrap;
    }

    .total-card {
      width: 100%;
    }

    .status-tabs {
      width: 100%;
    }

    .status-tabs button {
      flex: 1;
      justify-content: center;
      padding: 8px 6px;
    }

    .confirmation-panel {
      padding: 16px;
    }

    .confirmation-actions {
      flex-wrap: wrap;
    }

    .confirmation-actions button {
      flex: 1;
    }

    .pagination-controls {
      width: 100%;
      justify-content: space-between;
      gap: 5px;
    }
  }
</style>

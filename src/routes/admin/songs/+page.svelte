
<script>
  import { invalidateAll } from "$app/navigation";
  import { getContext } from "svelte";

  import {
    createPlayerController,
    PLAYER_CONTEXT_KEY
  } from "#lib/player/player-controller.svelte.js";

  /** @type {import('./$types').PageProps} */
  let { data } = $props();

  /** @type {ReturnType<typeof createPlayerController>} */
  const player = getContext(PLAYER_CONTEXT_KEY);

  let searchTerm = $state("");
  let artistFilter = $state("");
  let genreFilter = $state("");
  let moodFilter = $state("");
  let categoryFilter = $state("");
  let currentPage = $state(1);

  const PAGE_SIZE = 10;

  /** @type {number | null} */
  let editingSongId = $state(null);

  let isSaving = $state(false);
  let saveError = $state("");
  let saveSuccess = $state("");

  let isSavingCover = $state(false);
  let coverImageError = $state("");
  let coverSaveError = $state("");
  let coverSaveSuccess = $state("");

  /** @type {File | null} */
  let selectedCoverFile = $state(null);

  /** @type {string} */
  let coverPreviewUrl = $state("");

  /** @type {HTMLInputElement | null} */
  let coverInputElement = $state(null);

  const MAX_COVER_BYTES = 5 * 1024 * 1024;

  /** ID of the song selected for deletion or retry. */
  /** @type {number | null} */
  let deletingSongId = $state(null);

  let deletionConfirmation = $state("");
  let isDeleting = $state(false);
  let deletionError = $state("");
  let deletionSuccess = $state("");

  let title = $state("");
  let artist = $state("");
  let album = $state("");
  let year = $state("");
  let durationMinutes = $state("");
  let durationRemainder = $state("");

  let selectedLanguageId = $state("");
  let selectedGenreId = $state("");

  /** @type {number[]} */
  let selectedMoodIds = $state([]);

  /** @type {number[]} */
  let selectedCategoryIds = $state([]);

  const artistOptions = $derived(
    [...new Set(
      data.songs
        .map((song) => song.artist.trim())
        .filter(Boolean)
    )].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )
  );

  const genreOptions = $derived(
    data.classifications.filter((item) => item.type === "GENRE")
  );

  const moodOptions = $derived(
    data.classifications.filter((item) => item.type === "MOOD")
  );

  const categoryOptions = $derived(
    data.classifications.filter((item) => item.type === "CATEGORY")
  );

  const filteredSongs = $derived(
    data.songs.filter((song) => {
      const term = searchTerm.trim().toLocaleLowerCase();

      if (term) {
        const searchableValues = [
          song.title,
          song.artist,
          song.album ?? "",
          ...song.classifications.map(
            (entry) => entry.classification.name
          )
        ];

        const matchesSearch = searchableValues.some((value) =>
          value.toLocaleLowerCase().includes(term)
        );

        if (!matchesSearch) return false;
      }

      if (artistFilter && song.artist !== artistFilter) {
        return false;
      }

      if (
        genreFilter &&
        !song.classifications.some(
          (entry) =>
            entry.classification.type === "GENRE" &&
            String(entry.classification.id) === genreFilter
        )
      ) {
        return false;
      }

      if (
        moodFilter &&
        !song.classifications.some(
          (entry) =>
            entry.classification.type === "MOOD" &&
            String(entry.classification.id) === moodFilter
        )
      ) {
        return false;
      }

      if (
        categoryFilter &&
        !song.classifications.some(
          (entry) =>
            entry.classification.type === "CATEGORY" &&
            String(entry.classification.id) === categoryFilter
        )
      ) {
        return false;
      }

      return true;
    })
  );

  const totalPages = $derived(
    Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE))
  );

  // Keep the displayed page valid after a deletion or data refresh
  // reduces the number of matching results.
  const displayedPage = $derived(
    Math.min(currentPage, totalPages)
  );

  const resultStart = $derived(
    filteredSongs.length === 0
      ? 0
      : (displayedPage - 1) * PAGE_SIZE + 1
  );

  const resultEnd = $derived(
    Math.min(displayedPage * PAGE_SIZE, filteredSongs.length)
  );

  const visibleSongs = $derived(
    filteredSongs.slice(
      (displayedPage - 1) * PAGE_SIZE,
      displayedPage * PAGE_SIZE
    )
  );

  const hasActiveFilters = $derived(
    Boolean(
      searchTerm.trim() ||
      artistFilter ||
      genreFilter ||
      moodFilter ||
      categoryFilter
    )
  );

  function resetPagination() {
    currentPage = 1;
  }

  function clearFilters() {
    searchTerm = "";
    artistFilter = "";
    genreFilter = "";
    moodFilter = "";
    categoryFilter = "";
    currentPage = 1;
  }

  const deletionCandidate = $derived(
    data.songs.find((song) => song.id === deletingSongId) ?? null
  );

  const editingSong = $derived(
    data.songs.find((song) => song.id === editingSongId) ?? null
  );

  const expectedDeletionConfirmation = $derived(
    deletionCandidate
      ? `${deletionCandidate.title} — ${deletionCandidate.artist}`
      : ""
  );

  /**
   * Format a stored duration in minutes and seconds.
   *
   * @param {number | null} seconds
   * @returns {string}
   */
  function formatDuration(seconds) {
    if (
      seconds === null ||
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      return "—";
    }

    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const remaining = String(total % 60).padStart(2, "0");

    return `${minutes}:${remaining}`;
  }

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
   * Send a Music Library song to the shared playback controller.
   *
   * The browser receives application endpoint URLs only.
   * R2 object keys remain server-side.
   *
   * @param {number} songId
   * @returns {Promise<boolean> | undefined}
   */
  function togglePlayback(songId) {
    const song = data.songs.find(
      (entry) => entry.id === songId
    );

    if (!song || song.deletionPending) {
      return;
    }

    return player.toggleTrack({
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioUrl: `/api/admin/songs/${song.id}/audio`,
      coverUrl: song.coverKey
        ? `/api/admin/songs/${song.id}/cover`
        : null,
      deletionPending: song.deletionPending
    });
  }

  /**
   * Synchronize the selected track with refreshed Music Library data.
   *
   * This updates displayed metadata without replacing or restarting
   * the active audio source.
   */
  function syncCurrentTrackMetadata() {
    const currentTrack = player.state.currentTrack;

    if (!currentTrack) {
      return;
    }

    const song = data.songs.find(
      (entry) => entry.id === currentTrack.id
    );

    // Clear the player if the song no longer exists.
    if (!song) {
      player.clearTrack(currentTrack.id);
      return;
    }

    // updateTrackMetadata also stops a song marked pending deletion.
    player.updateTrackMetadata({
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioUrl: currentTrack.audioUrl,
      coverUrl: song.coverKey
        ? `/api/admin/songs/${song.id}/cover`
        : null,
      deletionPending: song.deletionPending
    });
  }

  /**
   * Clear the selected cover image and release its preview URL.
   */
  function clearCoverSelection() {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    coverPreviewUrl = "";
    selectedCoverFile = null;
    coverImageError = "";

    if (coverInputElement) {
      coverInputElement.value = "";
    }
  }

  /**
   * Validate and preview the selected replacement cover.
   *
   * @param {Event} event
   */
  function handleEditCoverChange(event) {
    const input = event.currentTarget;

    if (!(input instanceof HTMLInputElement)) return;

    const file = input.files?.[0] ?? null;

    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    coverPreviewUrl = "";
    selectedCoverFile = null;
    coverImageError = "";

    if (!file) return;

    if (file.size === 0) {
      coverImageError = "The selected cover image is empty.";
      input.value = "";
      return;
    }

    if (file.size > MAX_COVER_BYTES) {
      coverImageError = "Cover image must not exceed 5 MiB.";
      input.value = "";
      return;
    }

    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp"
    ]);

    const validExtension = /\.(jpg|jpeg|png|webp)$/i.test(file.name);

    const validType =
      file.type === "" || allowedTypes.has(file.type.toLowerCase());

    if (!validExtension || !validType) {
      coverImageError = "Choose a JPEG, PNG or WebP image.";
      input.value = "";
      return;
    }

    selectedCoverFile = file;
    coverPreviewUrl = URL.createObjectURL(file);
  }

  /**
   * Upload new cover artwork or replace existing artwork.
   */
  async function saveCoverArtwork() {
    if (
      editingSongId === null ||
      !selectedCoverFile ||
      isSavingCover ||
      isSaving ||
      isDeleting
    ) {
      return;
    }

    const songId = editingSongId;

    isSavingCover = true;
    coverSaveError = "";
    coverSaveSuccess = "";

    try {
      const formData = new FormData();
      formData.append("coverFile", selectedCoverFile);

      const response = await fetch(
        `/api/admin/songs/${songId}/cover`,
        {
          method: "PUT",
          body: formData
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        coverSaveError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to update cover artwork.";

        return;
      }

      clearCoverSelection();

      let refreshWarning = "";

      try {
        await invalidateAll();
        syncCurrentTrackMetadata();
      } catch (error) {
        console.error(
          "Cover artwork saved, but library refresh failed:",
          error
        );

        refreshWarning =
          " The artwork was saved, but the library could not refresh. Reload the page to see the updated cover.";
      }

      coverSaveSuccess = result?.cleanupWarning
        ? "Cover artwork updated, but the previous image could not be removed from storage."
        : "Cover artwork updated successfully.";

      coverSaveSuccess += refreshWarning;
    } catch (error) {
      console.error("Cover artwork update failed:", error);

      coverSaveError =
        "Unable to confirm the cover update. Refresh the library before retrying.";
    } finally {
      isSavingCover = false;
    }
  }

  /**
   * Remove the existing cover artwork.
   */
  async function removeCoverArtwork() {
    if (
      editingSongId === null ||
      !editingSong?.coverKey ||
      isSavingCover ||
      isSaving ||
      isDeleting
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Remove the cover artwork for "${editingSong.title}"?`
    );

    if (!confirmed) return;

    const songId = editingSongId;

    isSavingCover = true;
    coverSaveError = "";
    coverSaveSuccess = "";

    try {
      const response = await fetch(
        `/api/admin/songs/${songId}/cover`,
        { method: "DELETE" }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        coverSaveError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to remove cover artwork.";

        return;
      }

      clearCoverSelection();

      let refreshWarning = "";

      try {
        await invalidateAll();
        syncCurrentTrackMetadata();
      } catch (error) {
        console.error(
          "Cover removed, but library refresh failed:",
          error
        );

        refreshWarning =
          " Reload the page to see the updated artwork.";
      }

      coverSaveSuccess = result?.cleanupWarning
        ? "Artwork was removed from the song, but its storage cleanup could not be confirmed."
        : "Cover artwork removed successfully.";

      coverSaveSuccess += refreshWarning;
    } catch (error) {
      console.error("Cover artwork removal failed:", error);

      coverSaveError =
        "Unable to confirm artwork removal. Refresh the library before retrying.";
    } finally {
      isSavingCover = false;
    }
  }

  /**
   * Reset the editor and return to the library list.
   */
  function resetEditor() {
    clearCoverSelection();
    coverSaveError = "";
    coverSaveSuccess = "";

    editingSongId = null;
    title = "";
    artist = "";
    album = "";
    year = "";
    durationMinutes = "";
    durationRemainder = "";

    selectedLanguageId = "";
    selectedGenreId = "";
    selectedMoodIds = [];
    selectedCategoryIds = [];

    saveError = "";
  }

  /**
   * Open the editor with the selected song's existing metadata.
   *
   * @param {import('./$types').PageData['songs'][number]} song
   */
  function beginEdit(song) {
    if (
      isSaving ||
      isDeleting ||
      deletingSongId !== null ||
      song.deletionPending
    ) {
      return;
    }

    const language = song.classifications.find(
      (entry) => entry.classification.type === "LANGUAGE"
    );

    const genre = song.classifications.find(
      (entry) => entry.classification.type === "GENRE"
    );

    clearCoverSelection();
    coverSaveError = "";
    coverSaveSuccess = "";

    editingSongId = song.id;

    title = song.title;
    artist = song.artist;
    album = song.album ?? "";
    year = song.year === null ? "" : String(song.year);

    if (song.durationSeconds === null) {
      durationMinutes = "";
      durationRemainder = "";
    } else {
      durationMinutes = String(
        Math.floor(song.durationSeconds / 60)
      );

      durationRemainder = String(
        song.durationSeconds % 60
      );
    }

    selectedLanguageId = language
      ? String(language.classification.id)
      : "";

    selectedGenreId = genre
      ? String(genre.classification.id)
      : "";

    selectedMoodIds = song.classifications
      .filter(
        (entry) => entry.classification.type === "MOOD"
      )
      .map((entry) => entry.classification.id);

    selectedCategoryIds = song.classifications
      .filter(
        (entry) => entry.classification.type === "CATEGORY"
      )
      .map((entry) => entry.classification.id);

    saveError = "";
    saveSuccess = "";

    document
      .getElementById("song-editor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Save metadata corrections without replacing the audio file.
   *
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();

    if (
      isSaving ||
      isSavingCover ||
      isDeleting ||
      editingSongId === null
    ) {
      return;
    }

    saveError = "";
    saveSuccess = "";

    const normalizedYear = String(year ?? "").trim();
    const normalizedMinutes = String(
      durationMinutes ?? ""
    ).trim();
    const normalizedSeconds = String(
      durationRemainder ?? ""
    ).trim();

    let parsedYear = null;

    if (normalizedYear !== "") {
      if (
        !/^\d{4}$/.test(normalizedYear) ||
        Number(normalizedYear) < 1000 ||
        Number(normalizedYear) > 9999
      ) {
        saveError = "Enter a valid four-digit release year.";
        return;
      }

      parsedYear = Number(normalizedYear);
    }

    let parsedDuration = null;

    if (
      normalizedMinutes !== "" ||
      normalizedSeconds !== ""
    ) {
      if (
        (normalizedMinutes !== "" &&
          !/^\d+$/.test(normalizedMinutes)) ||
        (normalizedSeconds !== "" &&
          !/^\d+$/.test(normalizedSeconds))
      ) {
        saveError =
          "Duration must contain whole minutes and seconds.";
        return;
      }

      const minutes =
        normalizedMinutes === ""
          ? 0
          : Number(normalizedMinutes);

      const seconds =
        normalizedSeconds === ""
          ? 0
          : Number(normalizedSeconds);

      if (
        !Number.isSafeInteger(minutes) ||
        minutes < 0 ||
        !Number.isSafeInteger(seconds) ||
        seconds < 0 ||
        seconds > 59
      ) {
        saveError =
          "Minutes must be non-negative and seconds must be between 0 and 59.";
        return;
      }

      parsedDuration = minutes * 60 + seconds;

      if (!Number.isSafeInteger(parsedDuration)) {
        saveError = "The duration is outside the supported range.";
        return;
      }
    }

    isSaving = true;

    try {
      const response = await fetch(
        `/api/admin/songs/${editingSongId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: title.trim(),
            artist: artist.trim(),
            album: album.trim() || null,
            year: parsedYear,
            durationSeconds: parsedDuration,
            languageId: Number(selectedLanguageId),
            genreId: Number(selectedGenreId),
            moodIds: selectedMoodIds,
            categoryIds: selectedCategoryIds
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        saveError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to update the song. Please try again.";

        return;
      }

      const savedTitle =
        typeof result?.song?.title === "string"
          ? result.song.title
          : title.trim();

      resetEditor();
      saveSuccess = `"${savedTitle}" was updated successfully.`;

      try {
        await invalidateAll();
        syncCurrentTrackMetadata();
      } catch (error) {
        console.error(
          "Song saved, but the library refresh failed:",
          error
        );

        saveError =
          "The changes were saved, but the library could not refresh. Reload the page to see the updated details.";

        saveSuccess = "";
      }
    } catch (error) {
      console.error("Song metadata update failed:", error);

      saveError =
        "Unable to connect to the server. Please try again.";
    } finally {
      isSaving = false;
    }
  }

  /**
   * Open the confirmation panel for a song or retry.
   *
   * @param {import('./$types').PageData['songs'][number]} song
   */
  function beginDelete(song) {
    if (isDeleting || isSaving || editingSongId !== null) {
      return;
    }

    // Pause the selected track before opening the confirmation.
    // A song already pending deletion must be removed from the player.
    if (isCurrentTrack(song.id)) {
      if (song.deletionPending) {
        player.clearTrack(song.id);
      } else {
        player.pause();
      }
    }

    deletingSongId = song.id;
    deletionConfirmation = "";
    deletionError = "";
    deletionSuccess = "";
  }

  /**
   * Close the confirmation panel without sending a request.
   */
  function cancelDelete() {
    if (isDeleting) return;

    deletingSongId = null;
    deletionConfirmation = "";
    deletionError = "";
  }

  /**
   * Send a confirmed deletion or retry request.
   *
   * @param {SubmitEvent} event
   */
  async function handleDeleteSubmit(event) {
    event.preventDefault();

    if (isDeleting || deletingSongId === null) return;

    const song = data.songs.find(
      (entry) => entry.id === deletingSongId
    );

    if (!song) {
      deletionError =
        "This song is no longer in the current library data. Refresh the page and check its status.";
      return;
    }

    // Match the exact title-and-artist confirmation required by the API.
    const expectedConfirmation = `${song.title} — ${song.artist}`;

    if (deletionConfirmation !== expectedConfirmation) {
      deletionError =
        "The confirmation must exactly match the displayed song title and artist.";
      return;
    }

    isDeleting = true;
    deletionError = "";
    deletionSuccess = "";

    try {
      const response = await fetch(
        `/api/admin/songs/${song.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            confirmation: deletionConfirmation
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        deletionError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to complete deletion. Check the song status before retrying.";

        // Do not keep a potentially pending-deletion song selected.
        player.clearTrack(song.id);

        // Refresh because the API may have marked the song pending
        // even though storage cleanup failed.
        try {
          await invalidateAll();
          syncCurrentTrackMetadata();
        } catch (refreshError) {
          console.error(
            "Deletion failed and the library refresh failed:",
            refreshError
          );

          deletionError +=
            " The library could not refresh. Reload the page before retrying.";
        }

        return;
      }

      deletingSongId = null;
      deletionConfirmation = "";

      // Release the selected audio source after confirmed deletion.
      player.clearTrack(song.id);

      deletionSuccess =
        `"${song.title}" by ${song.artist} was deleted successfully.`;

      try {
        await invalidateAll();
        syncCurrentTrackMetadata();
      } catch (refreshError) {
        console.error(
          "Song was deleted, but the library refresh failed:",
          refreshError
        );

        deletionSuccess = "";
        deletionError =
          "The API confirmed deletion, but the library could not refresh. Reload the page to see the updated collection.";
      }
    } catch (error) {
      console.error("Song deletion request failed:", error);

      // The server may have completed deletion despite a network failure.
      player.clearTrack(song.id);

      deletionError =
        "The request outcome could not be confirmed. Refresh the library and check the song's status before retrying.";

      // A network failure does not necessarily mean the server
      // stopped processing the request.
      try {
        await invalidateAll();
        syncCurrentTrackMetadata();
      } catch (refreshError) {
        console.error(
          "Unable to refresh after an uncertain deletion request:",
          refreshError
        );

        deletionError +=
          " Refresh failed; reload the page before attempting another request.";
      }
    } finally {
      isDeleting = false;
    }
  }
</script>

<svelte:head>
  <title>Music Library | Music Archive</title>
</svelte:head>

<div class="library-content">
  <section class="page-intro">
    <div>
      <p class="eyebrow">COLLECTION MANAGEMENT</p>
      <p>
        Browse your uploaded songs and correct their metadata.
      </p>
    </div>

    <div class="total-card">
      <span>Total songs</span>
      <strong>{data.songs.length}</strong>
    </div>
  </section>

  {#if saveError}
    <div class="message error-message" role="alert">
      {saveError}
    </div>
  {/if}

  {#if saveSuccess}
    <div class="message success-message" role="status">
      {saveSuccess}
    </div>
  {/if}

  {#if deletionError}
    <div class="message error-message" role="alert">
      {deletionError}
    </div>
  {/if}

  {#if deletionSuccess}
    <div class="message success-message" role="status">
      {deletionSuccess}
    </div>
  {/if}

  {#if deletionCandidate}
    <section
      class="delete-confirmation-panel"
      aria-labelledby="delete-confirmation-heading"
    >
      <div class="panel-heading">
        <div>
          <p class="eyebrow">DESTRUCTIVE ACTION</p>

          <h2 id="delete-confirmation-heading">
            {deletionCandidate.deletionPending
              ? "Retry song deletion"
              : "Delete song permanently"}
          </h2>

          <p>Confirm the exact song before continuing.</p>
        </div>

        <button
          type="button"
          class="secondary-button"
          onclick={cancelDelete}
          disabled={isDeleting}
        >
          Cancel
        </button>
      </div>

      <div class="deletion-warning" role="note">
        {#if deletionCandidate.deletionPending}
          A previous deletion attempt did not complete. Retrying will attempt storage cleanup again. The song record is retained until the required cleanup succeeds.
        {:else}
          This permanently removes the song record and its associated audio from storage. This action cannot be undone.
        {/if}
      </div>

      <form
        class="delete-confirmation-form"
        onsubmit={handleDeleteSubmit}
      >
        <p class="delete-song-identity">
          Song: <strong>{deletionCandidate.title}</strong> by
          <strong>{deletionCandidate.artist}</strong>
        </p>

        <div class="field">
          <label for="delete-confirmation-input">
            Type this exact confirmation text:
          </label>

          <p class="confirmation-phrase">
            {expectedDeletionConfirmation}
          </p>

          <input
            id="delete-confirmation-input"
            name="confirmation"
            type="text"
            bind:value={deletionConfirmation}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            required
            disabled={isDeleting}
            aria-describedby="delete-confirmation-help"
          />

          <small id="delete-confirmation-help">
            The title, punctuation, spacing and artist must match exactly.
          </small>
        </div>

        <div class="form-actions">
          <button
            class="delete-button"
            type="submit"
            disabled={
              isDeleting ||
              deletionConfirmation !== expectedDeletionConfirmation
            }
          >
            {isDeleting
              ? "Deleting..."
              : deletionCandidate.deletionPending
                ? "Retry deletion"
                : "Delete permanently"}
          </button>

          <button
            class="secondary-button"
            type="button"
            onclick={cancelDelete}
            disabled={isDeleting}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  {/if}

  {#if editingSongId !== null}
    <section
      class="editor-panel"
      id="song-editor"
      aria-labelledby="editor-heading"
    >
      <div class="panel-heading">
        <div>
          <p class="eyebrow">METADATA MANAGEMENT</p>
          <h2 id="editor-heading">Edit song information</h2>

          <p>
            Correct the existing details. The current audio file will
            not be replaced.
          </p>
        </div>

        <button
          type="button"
          class="secondary-button"
          onclick={resetEditor}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>

      <form class="editor-form" onsubmit={handleSubmit}>
        <fieldset disabled={isSaving || isSavingCover}>
          <legend>Song details</legend>

          <div class="form-grid">
            <div class="field">
              <label for="edit-title">Song title *</label>
              <input
                id="edit-title"
                name="title"
                type="text"
                bind:value={title}
                maxlength="191"
                required
              />
            </div>

            <div class="field">
              <label for="edit-artist">Artist *</label>
              <input
                id="edit-artist"
                name="artist"
                type="text"
                bind:value={artist}
                maxlength="191"
                required
              />
            </div>

            <div class="field">
              <label for="edit-album">Album</label>
              <input
                id="edit-album"
                name="album"
                type="text"
                bind:value={album}
                maxlength="191"
              />
            </div>

            <div class="field">
              <label for="edit-year">Release year</label>
              <input
                id="edit-year"
                name="year"
                type="number"
                bind:value={year}
                min="1000"
                max="9999"
                step="1"
              />
            </div>
          </div>

          <div class="field duration-field">
            <span class="field-label">Duration</span>

            <div class="duration-inputs">
              <div>
                <input
                  id="edit-duration-minutes"
                  name="durationMinutes"
                  type="number"
                  bind:value={durationMinutes}
                  min="0"
                  step="1"
                  aria-label="Duration minutes"
                  placeholder="0"
                />

                <label for="edit-duration-minutes">Minutes</label>
              </div>

              <span class="duration-colon" aria-hidden="true">:</span>

              <div>
                <input
                  id="edit-duration-seconds"
                  name="durationRemainder"
                  type="number"
                  bind:value={durationRemainder}
                  min="0"
                  max="59"
                  step="1"
                  aria-label="Duration seconds"
                  placeholder="00"
                />

                <label for="edit-duration-seconds">Seconds</label>
              </div>
            </div>

            <small>
              Leave both fields blank if the duration is unknown.
            </small>
          </div>

          <div class="section-divider"></div>

          <div class="section-heading">
            <h3>Primary classifications</h3>
            <p>Choose one language and one genre.</p>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="edit-language">Language *</label>

              <select
                id="edit-language"
                name="languageId"
                bind:value={selectedLanguageId}
                required
              >
                <option value="">Choose a language</option>

                {#each data.classifications.filter((item) => item.type === "LANGUAGE") as item (item.id)}
                  <option value={String(item.id)}>
                    {item.name}
                  </option>
                {/each}
              </select>
            </div>

            <div class="field">
              <label for="edit-genre">Genre *</label>

              <select
                id="edit-genre"
                name="genreId"
                bind:value={selectedGenreId}
                required
              >
                <option value="">Choose a genre</option>

                {#each data.classifications.filter((item) => item.type === "GENRE") as item (item.id)}
                  <option value={String(item.id)}>
                    {item.name}
                  </option>
                {/each}
              </select>
            </div>
          </div>

          <div class="section-divider"></div>

          <div class="section-heading">
            <h3>Moods</h3>
            <p>Select any number of moods.</p>
          </div>

          <div class="choice-grid">
            {#each data.classifications.filter((item) => item.type === "MOOD") as item (item.id)}
              <label class="choice">
                <input
                  type="checkbox"
                  name="moodIds"
                  value={item.id}
                  bind:group={selectedMoodIds}
                />

                <span>{item.name}</span>
              </label>
            {/each}
          </div>

          <div class="section-divider"></div>

          <div class="section-heading">
            <h3>General categories</h3>
            <p>Optional labels that can cross genres and moods.</p>
          </div>

          <div class="choice-grid">
            {#each data.classifications.filter((item) => item.type === "CATEGORY") as item (item.id)}
              <label class="choice">
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={item.id}
                  bind:group={selectedCategoryIds}
                />

                <span>{item.name}</span>
              </label>
            {/each}
          </div>

          <div class="section-divider"></div>

          <div class="section-heading">
            <h3>Cover artwork</h3>
            <p>
              Add, replace or remove this song's cover image. This is optional.
            </p>
          </div>

          <div class="cover-editor">
            <div class="cover-editor-preview">
              {#if coverPreviewUrl}
                <img
                  src={coverPreviewUrl}
                  alt="Selected replacement cover artwork"
                />
              {:else if editingSong?.coverKey}
                <img
                  src={`/api/admin/songs/${editingSong.id}/cover`}
                  alt={`Current cover artwork for ${editingSong.title}`}
                />
              {:else}
                <div class="cover-placeholder">
                  <span aria-hidden="true">♫</span>
                  <small>No artwork</small>
                </div>
              {/if}
            </div>

            <div class="cover-editor-controls">
              <label for="edit-cover-file">Choose cover image</label>

              <input
                bind:this={coverInputElement}
                class="cover-file-input"
                id="edit-cover-file"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onchange={handleEditCoverChange}
                disabled={isSaving || isSavingCover || isDeleting}
              />

              <small class="cover-help">
                Optional. JPEG, PNG or WebP. Maximum size: 5 MiB.
                Existing artwork remains unchanged until you explicitly replace
                or remove it.
              </small>

              {#if selectedCoverFile}
                <small class="cover-help">
                  Selected: {selectedCoverFile.name}
                </small>
              {/if}

              {#if coverImageError}
                <p class="cover-feedback cover-feedback-error" role="alert">
                  {coverImageError}
                </p>
              {/if}

              <div class="cover-actions">
                {#if selectedCoverFile}
                  <button
                    class="primary-button"
                    type="button"
                    onclick={saveCoverArtwork}
                    disabled={isSaving || isSavingCover || isDeleting}
                  >
                    {isSavingCover
                      ? "Uploading artwork..."
                      : editingSong?.coverKey
                        ? "Replace artwork"
                        : "Add artwork"}
                  </button>

                  <button
                    class="secondary-button"
                    type="button"
                    onclick={clearCoverSelection}
                    disabled={isSaving || isSavingCover || isDeleting}
                  >
                    Clear selection
                  </button>
                {/if}

                {#if editingSong?.coverKey}
                  <button
                    class="delete-button"
                    type="button"
                    onclick={removeCoverArtwork}
                    disabled={isSaving || isSavingCover || isDeleting}
                  >
                    Remove artwork
                  </button>
                {/if}
              </div>

              {#if coverSaveError}
                <p class="cover-feedback cover-feedback-error" role="alert">
                  {coverSaveError}
                </p>
              {/if}

              {#if coverSaveSuccess}
                <p class="cover-feedback cover-feedback-success" role="status">
                  {coverSaveSuccess}
                </p>
              {/if}
            </div>
          </div>

          <div class="audio-preserved">
            <span aria-hidden="true">✓</span>

            <p>
              The existing audio file, publication status and display
              order will be preserved.
            </p>
          </div>
        </fieldset>

        <div class="form-actions">
          <button
            class="primary-button"
            type="submit"
            disabled={isSaving || isDeleting}
          >
            {isSaving ? "Saving changes..." : "Save changes"}
          </button>

          <button
            class="secondary-button"
            type="button"
            onclick={resetEditor}
            disabled={isSaving || isDeleting}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  {/if}

  <section class="library-panel" aria-label="Music library">
    <div class="panel-heading">
      <div>
        <h2>All songs</h2>
        <p>
          Search your collection and select Edit to correct metadata.
        </p>
      </div>

      <span class="record-count">
        {filteredSongs.length}
        {filteredSongs.length === 1 ? "song" : "songs"}
      </span>
    </div>

    <div class="search-area">
      <div class="filter-grid">
        <div class="filter-control search-control">
          <label for="song-search">Search songs</label>
          <input
            id="song-search"
            type="search"
            bind:value={searchTerm}
            oninput={resetPagination}
            placeholder="Search title, artist, album or classification..."
          />
        </div>

        <div class="filter-control">
          <label for="filter-genre">Genre</label>
          <select
            id="filter-genre"
            bind:value={genreFilter}
            onchange={resetPagination}
          >
            <option value="">All genres</option>
            {#each genreOptions as item (item.id)}
              <option value={String(item.id)}>{item.name}</option>
            {/each}
          </select>
        </div>

        <div class="filter-control">
          <label for="filter-artist">Artist</label>
          <select
            id="filter-artist"
            bind:value={artistFilter}
            onchange={resetPagination}
          >
            <option value="">All artists</option>
            {#each artistOptions as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>

        <div class="filter-control">
          <label for="filter-mood">Mood</label>
          <select
            id="filter-mood"
            bind:value={moodFilter}
            onchange={resetPagination}
          >
            <option value="">All moods</option>
            {#each moodOptions as item (item.id)}
              <option value={String(item.id)}>{item.name}</option>
            {/each}
          </select>
        </div>

        <div class="filter-control">
          <label for="filter-category">Category</label>
          <select
            id="filter-category"
            bind:value={categoryFilter}
            onchange={resetPagination}
          >
            <option value="">All categories</option>
            {#each categoryOptions as item (item.id)}
              <option value={String(item.id)}>{item.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="filter-toolbar-footer">
        <p>Combine search and filters to narrow your collection.</p>
        <button
          class="clear-filters-button"
          type="button"
          onclick={clearFilters}
          disabled={!hasActiveFilters}
        >
          Clear filters
        </button>
      </div>
    </div>

    {#if data.songs.length === 0}
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">♫</span>
        <h3>Your library is empty.</h3>
        <p>
          Uploaded songs will appear here when they are added to
          your archive.
        </p>
      </div>
    {:else if filteredSongs.length === 0}
      <div class="empty-state">
        <h3>No matching songs</h3>
        <p>Try a different search term or adjust the filters.</p>
      </div>
    {:else}
      <div class="table-scroll">
        <table>
          <colgroup>
            <col class="song-column" />
            <col class="album-column" />
            <col class="language-column" />
            <col class="genre-column" />
            <col class="mood-column" />
            <col class="year-column" />
            <col class="duration-column" />
            <col class="category-column" />
            <col class="status-column" />
            <col class="actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Song</th>
              <th scope="col">Album</th>
              <th scope="col">Language</th>
              <th scope="col">Genre</th>
              <th scope="col">Moods</th>
              <th scope="col">Year</th>
              <th scope="col">Duration</th>
              <th scope="col">Categories</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>

          <tbody>
            {#each visibleSongs as song (song.id)}
              <tr>
                <td>
                  <div class="song-info">
                    {#if song.coverKey}
                      <img
                        class="song-cover"
                        src={`/api/admin/songs/${song.id}/cover`}
                        alt={`Cover artwork for ${song.title}`}
                        loading="lazy"
                      />
                    {:else}
                      <span class="song-icon" aria-hidden="true">♫</span>
                    {/if}

                    <div class="song-info-details">
                      <strong>{song.title}</strong>
                      <span class="song-artist">{song.artist}</span>

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
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                            </svg>
                          {:else}
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
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

                <td>{song.album || "—"}</td>

                <td>
                  {song.classifications.find(
                    (entry) => entry.classification.type === "LANGUAGE"
                  )?.classification.name || "—"}
                </td>

                <td>
                  {song.classifications.find(
                    (entry) => entry.classification.type === "GENRE"
                  )?.classification.name || "—"}
                </td>

                <td>
                  {#if song.classifications.some((entry) => entry.classification.type === "MOOD")}
                    <div class="tag-list">
                      {#each song.classifications.filter((entry) => entry.classification.type === "MOOD") as entry (entry.classification.id)}
                        <span class="classification-tag">
                          {entry.classification.name}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>

                <td>{song.year ?? "—"}</td>
                <td>{formatDuration(song.durationSeconds)}</td>

                <td>
                  {#if song.classifications.some((entry) => entry.classification.type === "CATEGORY")}
                    <div class="tag-list">
                      {#each song.classifications.filter((entry) => entry.classification.type === "CATEGORY") as entry (entry.classification.id)}
                        <span class="classification-tag">
                          {entry.classification.name}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="muted">Uncategorized</span>
                  {/if}
                </td>

                <td>
                  <span
                    class="status"
                    class:published={song.isPublished && !song.deletionPending}
                    class:pending-deletion={song.deletionPending}
                  >
                    {song.deletionPending
                      ? "Pending deletion"
                      : song.isPublished
                        ? "Published"
                        : "Draft"}
                  </span>
                </td>

                <td>
                  <div class="action-buttons">
                    <button
                      class="edit-button"
                      type="button"
                      onclick={() => beginEdit(song)}
                      disabled={
                        isSaving ||
                        isDeleting ||
                        deletingSongId !== null ||
                        song.deletionPending
                      }
                      aria-label={`Edit ${song.title}`}
                    >
                      Edit
                    </button>

                    <button
                      class="delete-button table-delete-button"
                      type="button"
                      onclick={() => beginDelete(song)}
                      disabled={
                        isSaving ||
                        isDeleting ||
                        editingSongId !== null ||
                        deletingSongId !== null
                      }
                      aria-label={
                        song.deletionPending
                          ? `Retry deletion for ${song.title}`
                          : `Delete ${song.title}`
                      }
                    >
                      {song.deletionPending ? "Retry" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="pagination-bar" role="group" aria-label="Music Library pagination">
        <p class="result-summary">
          Showing <strong>{resultStart}–{resultEnd}</strong> of
          <strong>{filteredSongs.length}</strong>
          {filteredSongs.length === 1 ? "song" : "songs"}
        </p>

        <nav class="pagination-controls" aria-label="Song pages">
          <button
            class="pagination-button"
            type="button"
            onclick={() => (currentPage = Math.max(1, displayedPage - 1))}
            disabled={displayedPage <= 1}
          >
            Previous
          </button>

          <span class="page-indicator">
            Page <strong>{displayedPage}</strong> of <strong>{totalPages}</strong>
          </span>

          <button
            class="pagination-button"
            type="button"
            onclick={() => (currentPage = Math.min(totalPages, displayedPage + 1))}
            disabled={displayedPage >= totalPages}
          >
            Next
          </button>
        </nav>
      </div>
    {/if}
  </section>
</div>

<style>
  .library-content {
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
    margin-bottom: 26px;
  }

  .eyebrow {
    margin: 0 0 9px;
    color: #d9b87b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }

  .page-intro p:not(.eyebrow) {
    margin: 0;
    color: #aab4c6;
    font-size: 12px;
    line-height: 1.7;
  }

  .total-card {
    min-width: 115px;
    padding: 13px 17px;
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
    font-size: 10px;
  }

  .total-card strong {
    margin-top: 7px;
    font-size: 24px;
  }

  .message {
    margin-bottom: 18px;
    padding: 13px 15px;
    border: 1px solid;
    border-radius: 8px;
    font-size: 12px;
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

  .editor-panel,
  .library-panel {
    overflow: hidden;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
  }

  .editor-panel {
    margin-bottom: 25px;
    scroll-margin-top: 20px;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 20px 23px;
    border-bottom: 1px solid #293144;
  }

  .panel-heading h2 {
    margin: 0 0 7px;
    font-size: 15px;
    font-weight: 600;
  }

  .panel-heading p:not(.eyebrow) {
    margin: 0;
    color: #929cb1;
    font-size: 11px;
    line-height: 1.7;
  }

  .editor-form {
    padding: 23px;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  fieldset > legend {
    margin-bottom: 20px;
    color: #eef1f7;
    font-size: 13px;
    font-weight: 650;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 19px;
  }

  .field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
  }

  .field > label,
  .field-label {
    color: #d6dceb;
    font-size: 11px;
    font-weight: 600;
  }

  .field input,
  .field select,
  .search-area input,
  .search-area select {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 10px 12px;
    border: 1px solid #394258;
    border-radius: 7px;
    outline: none;
    background: #0c1322;
    color: #eef1f7;
    color-scheme: dark;
    font: inherit;
    font-size: 12px;
  }

  .field input:focus,
  .field select:focus,
  .search-area input:focus,
  .search-area select:focus {
    border-color: #d9b87b;
    box-shadow: 0 0 0 2px rgb(217 184 123 / 12%);
  }

  .duration-field {
    max-width: 360px;
    margin-top: 20px;
  }

  .duration-inputs {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .duration-inputs > div {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 7px;
  }

  .duration-inputs > div label {
    color: #929cb1;
    font-size: 10px;
  }

  .duration-inputs input {
    width: 100%;
  }

  .duration-colon {
    align-self: flex-start;
    margin-top: 10px;
    color: #d9b87b;
    font-size: 18px;
  }

  .field small {
    color: #929cb1;
    font-size: 10px;
    line-height: 1.7;
  }

  .section-divider {
    height: 1px;
    margin: 25px 0;
    background: #293144;
  }

  .section-heading {
    margin-bottom: 13px;
  }

  .section-heading h3 {
    margin: 0 0 5px;
    font-size: 12px;
    font-weight: 650;
  }

  .section-heading p {
    margin: 0;
    color: #929cb1;
    font-size: 10px;
    line-height: 1.7;
  }

  .choice-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .choice {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border: 1px solid #394258;
    border-radius: 7px;
    background: #171f30;
    color: #d6dceb;
    font-size: 11px;
    cursor: pointer;
  }

  .choice input {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: #d9b87b;
  }

  .choice:has(input:checked) {
    border-color: #8e754d;
    background: #2a261f;
    color: #f0d29b;
  }

  .audio-preserved {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    margin-top: 27px;
    padding: 13px;
    border: 1px solid #305a4b;
    border-radius: 8px;
    background: #182b27;
    color: #c3e8d4;
    font-size: 11px;
    line-height: 1.7;
  }

  .audio-preserved p {
    margin: 0;
  }

  .cover-editor {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    align-items: start;
    gap: 20px;
    padding: 16px;
    border: 1px solid #394258;
    border-radius: 9px;
    background: #171f30;
  }

  .cover-editor-preview {
    width: 130px;
    height: 130px;
    overflow: hidden;
    border: 1px solid #394258;
    border-radius: 9px;
    background: #0c1322;
  }

  .cover-editor-preview img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    display: flex;
    width: 100%;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #d9b87b;
  }

  .cover-placeholder span {
    font-size: 38px;
  }

  .cover-placeholder small {
    color: #929cb1;
    font-size: 10px;
  }

  .cover-editor-controls {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .cover-editor-controls > label {
    color: #d6dceb;
    font-size: 11px;
    font-weight: 600;
  }

  .cover-file-input {
    width: 100%;
    min-width: 0;
    padding: 9px;
    border: 1px solid #394258;
    border-radius: 7px;
    background: #0c1322;
    color: #eef1f7;
    font-size: 11px;
  }

  .cover-file-input::file-selector-button {
    margin-right: 10px;
    padding: 7px 10px;
    border: 1px solid #40495c;
    border-radius: 6px;
    background: #20283a;
    color: #e2e6ef;
    font-size: 10px;
    cursor: pointer;
  }

  .cover-help {
    color: #929cb1;
    font-size: 10px;
    line-height: 1.7;
  }

  .cover-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 9px;
  }

  .cover-feedback {
    margin: 0;
    font-size: 10px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .cover-feedback-error {
    color: #ffb5ba;
  }

  .cover-feedback-success {
    color: #a5dfc2;
  }

  .form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #293144;
  }

  .primary-button,
  .secondary-button,
  .edit-button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    padding: 9px 13px;
    border-radius: 7px;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .primary-button {
    border: 1px solid #d9b87b;
    background: #d9b87b;
    color: #151a28;
  }

  .primary-button:hover:not(:disabled) {
    background: #f0d29b;
  }

  .secondary-button {
    border: 1px solid #40495c;
    background: transparent;
    color: #d6dceb;
  }

  .secondary-button:hover:not(:disabled) {
    border-color: #8d99ae;
    background: #20283a;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .record-count {
    flex-shrink: 0;
    padding: 6px 10px;
    border-radius: 20px;
    background: #252b3c;
    color: #c9d2e3;
    font-size: 10px;
  }

  .search-area {
    padding: 17px 20px 14px;
    border-bottom: 1px solid #293144;
  }

  .filter-grid {
    display: grid;
    grid-template-columns: minmax(230px, 1.7fr) repeat(4, minmax(120px, 1fr));
    align-items: end;
    gap: 12px;
  }

  .filter-control {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 7px;
  }

  .filter-control > label {
    color: #d6dceb;
    font-size: 10px;
    font-weight: 600;
  }

  .filter-control input,
  .filter-control select {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 9px 10px;
    border: 1px solid #394258;
    border-radius: 7px;
    outline: none;
    background: #0c1322;
    color: #eef1f7;
    color-scheme: dark;
    font: inherit;
    font-size: 11px;
  }

  .filter-control input::placeholder {
    color: #6f7a91;
  }

  .filter-control input:focus,
  .filter-control select:focus {
    border-color: #d9b87b;
    box-shadow: 0 0 0 2px rgb(217 184 123 / 12%);
  }

  .filter-toolbar-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
  }

  .filter-toolbar-footer p {
    margin: 0;
    color: #808ba1;
    font-size: 10px;
    line-height: 1.6;
  }

  .clear-filters-button {
    display: inline-flex;
    min-height: 30px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    border: 1px solid #40495c;
    border-radius: 6px;
    background: transparent;
    color: #d6dceb;
    font: inherit;
    font-size: 10px;
    cursor: pointer;
  }

  .clear-filters-button:hover:not(:disabled) {
    border-color: #d9b87b;
    color: #f0d29b;
  }

  .clear-filters-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 1000px;
    table-layout: fixed;
    border-collapse: collapse;
    text-align: left;
    white-space: normal;
  }

  .song-column { width: 25%; }
  .album-column { width: 10%; }
  .language-column { width: 9%; }
  .genre-column { width: 9%; }
  .mood-column { width: 9%; }
  .year-column { width: 5%; }
  .duration-column { width: 6%; }
  .category-column { width: 10%; }
  .status-column { width: 8%; }
  .actions-column { width: 9%; }

  th {
    padding: 12px 10px;
    border-bottom: 1px solid #293144;
    background: #141c2d;
    color: #9ba6bb;
    font-size: 10px;
    font-weight: 650;
  }

  td {
    padding: 11px 10px;
    border-bottom: 1px solid #252d3e;
    color: #d6dceb;
    font-size: 11px;
    line-height: 1.5;
    vertical-align: middle;
    overflow-wrap: anywhere;
  }

  /* Give the fixed-size Edit/Delete buttons enough room in their column. */
  td:last-child {
    padding-right: 7px;
    padding-left: 7px;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: #161f31;
  }

  /* Song information and its row-level Play/Pause control. */
  .song-info {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
  }

  .song-icon,
  .song-cover {
    display: grid;
    width: 60px;
    height: 60px;
    flex: 0 0 60px;
    place-items: center;
    border: 1px solid #394258;
    border-radius: 8px;
    background: #252b3c;
  }

  .song-icon {
    color: #d9b87b;
    font-size: 25px;
  }

  .song-cover {
    display: block;
    object-fit: cover;
  }

  .song-info-details {
    flex: 1;
    min-width: 0;
  }

  .song-info strong {
    display: block;
    color: #f0f2f8;
    font-size: 12px;
    font-weight: 750;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .song-artist {
    display: block;
    margin-top: 4px;
    color: #c1cada;
    font-size: 11px;
    font-weight: 650;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .song-player {
    display: flex;
    width: fit-content;
    align-items: center;
    margin-top: 12px;
  }

  .player-play-button {
    display: grid;
    width: 36px;
    height: 36px;
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

  .player-play-button:hover {
    border-color: #f0d29b;
    background: #f0d29b;
    transform: translateY(-1px);
  }

  .player-play-button:focus-visible {
    outline: 2px solid #f0d29b;
    outline-offset: 3px;
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

  .player-error {
    max-width: 260px;
    margin: 7px 0 0;
    color: #ffb5ba;
    font-size: 10px;
    line-height: 1.5;
    white-space: normal;
  }

  .tag-list {
    display: flex;
    max-width: 100%;
    flex-wrap: wrap;
    gap: 5px;
    white-space: normal;
  }

  .classification-tag {
    max-width: 100%;
    padding: 4px 6px;
    border: 1px solid #394258;
    border-radius: 5px;
    background: #20283a;
    color: #cbd4e5;
    font-size: 10px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .muted {
    color: #929cb1;
  }

  .status {
    display: inline-block;
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

  .status.pending-deletion {
    border-color: #713b43;
    background: #321d28;
    color: #ffb5ba;
  }

  .edit-button {
    border: 1px solid #62543d;
    background: #27251f;
    color: #f0d29b;
  }

  .edit-button:hover:not(:disabled) {
    border-color: #d9b87b;
    background: #383024;
  }

  .empty-state {
    display: flex;
    min-height: 190px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 30px;
    text-align: center;
  }

  .empty-icon {
    color: #d9b87b;
    font-size: 28px;
  }

  .empty-state h3 {
    margin: 0;
    color: #eef1f7;
    font-size: 14px;
  }

  .empty-state p {
    margin: 0;
    color: #929cb1;
    font-size: 11px;
    line-height: 1.8;
  }

  .delete-confirmation-panel {
    overflow: hidden;
    margin-bottom: 25px;
    border: 1px solid #713b43;
    border-radius: 12px;
    background: #111827;
  }

  .deletion-warning {
    margin: 18px 23px 0;
    padding: 13px 15px;
    border: 1px solid #713b43;
    border-radius: 8px;
    background: #321d28;
    color: #ffb5ba;
    font-size: 11px;
    line-height: 1.7;
  }

  .delete-confirmation-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 23px;
  }

  .delete-song-identity {
    margin: 0;
    color: #d6dceb;
    font-size: 12px;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }

  .delete-song-identity strong {
    color: #f0d29b;
  }

  .delete-confirmation-form .field {
    max-width: 640px;
  }

  .confirmation-phrase {
    margin: 0;
    color: #f0d29b;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }

  .delete-confirmation-form input {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 10px 12px;
    border: 1px solid #713b43;
    border-radius: 7px;
    outline: none;
    background: #0c1322;
    color: #eef1f7;
    font: inherit;
    font-size: 12px;
  }

  .delete-confirmation-form input:focus {
    border-color: #d9b87b;
    box-shadow: 0 0 0 2px rgb(217 184 123 / 12%);
  }

  .delete-confirmation-form .form-actions {
    margin-top: 0;
    padding-top: 16px;
  }

  .action-buttons {
    display: flex;
    width: 72px;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .action-buttons .edit-button,
  .action-buttons .table-delete-button {
    width: 72px;
    min-width: 72px;
    min-height: 31px;
    height: 31px;
    padding: 5px 7px;
    border-radius: 6px;
    font-size: 10px;
    line-height: 1;
  }

  .delete-button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    padding: 9px 13px;
    border: 1px solid #8b454d;
    border-radius: 7px;
    background: #352027;
    color: #ffb5ba;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .delete-button:hover:not(:disabled) {
    border-color: #c36b75;
    background: #492630;
  }

  .delete-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .table-delete-button {
    min-width: 72px;
  }

  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 20px;
    border-top: 1px solid #293144;
    background: #0f1726;
  }

  .result-summary {
    margin: 0;
    color: #929cb1;
    font-size: 11px;
    line-height: 1.6;
  }

  .result-summary strong {
    color: #d6dceb;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .pagination-button {
    display: inline-flex;
    min-width: 82px;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    padding: 7px 11px;
    border: 1px solid #40495c;
    border-radius: 7px;
    background: #151e2e;
    color: #d6dceb;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .pagination-button:hover:not(:disabled) {
    border-color: #d9b87b;
    background: #29271f;
    color: #f0d29b;
  }

  .pagination-button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .page-indicator {
    min-width: 76px;
    color: #929cb1;
    font-size: 10px;
    text-align: center;
    white-space: nowrap;
  }

  .page-indicator strong {
    color: #eef1f7;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 1100px) {
    .filter-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .search-control {
      grid-column: span 2;
    }
  }

  @media (max-width: 760px) {
    .cover-editor {
      grid-template-columns: 100px minmax(0, 1fr);
      gap: 13px;
    }

    .cover-editor-preview {
      width: 100px;
      height: 100px;
    }

    .library-content {
      padding: 22px 15px 30px;
    }

    .page-intro {
      align-items: flex-start;
    }

    .total-card {
      min-width: 86px;
      padding: 11px;
    }

    .panel-heading,
    .editor-form {
      padding: 17px;
    }

    .form-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }

    .search-area {
      padding: 15px;
    }

    .filter-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .search-control {
      grid-column: 1 / -1;
    }

    .pagination-bar {
      align-items: flex-start;
      flex-direction: column;
      padding: 14px 15px;
    }

    .pagination-controls {
      width: 100%;
      justify-content: space-between;
    }

    .deletion-warning {
      margin-right: 17px;
      margin-left: 17px;
    }

    .delete-confirmation-form {
      padding: 17px;
    }
  }

  @media (max-width: 420px) {
    .page-intro {
      gap: 10px;
    }

    .total-card {
      min-width: 75px;
    }

    .panel-heading {
      align-items: flex-start;
      gap: 8px;
    }

    .panel-heading h2 {
      font-size: 13px;
    }

    .filter-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .search-control {
      grid-column: auto;
    }

    .filter-toolbar-footer {
      align-items: flex-start;
    }
  }

  
/* =========================================
   MUSIC LIBRARY — ACCENT-STYLED FILTERS
   ========================================= */

.filter-control select {
    accent-color: #d9b87b;
    cursor: pointer;
}

/* Modern customizable dropdown styling */
@supports (appearance: base-select) {

    .filter-control select,
    .filter-control select::picker(select) {
        appearance: base-select;
    }

    /* Dropdown panel */
    .filter-control select::picker(select) {
        padding: 5px;
        border: 1px solid #394258;
        border-radius: 9px;
        background: #111827;
        box-shadow: 0 12px 28px rgb(0 0 0 / 40%);
    }

    /* Individual options */
    .filter-control select option {
        padding: 9px 11px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: #111827;
        color: #d6dceb;
        cursor: pointer;
    }

    /* Hovered option */
    .filter-control select option:hover {
        border-color: #5e5038;
        background: #252b3c;
        color: #f0d29b;
    }

    /* Currently selected option */
    .filter-control select option:checked {
        border-color: #68533a;
        background: #30271e;
        color: #f0d29b;
        font-weight: 600;
    }

    /* Gold dropdown arrow */
    .filter-control select::picker-icon {
        color: #d9b87b;
        transition: rotate 150ms ease;
    }

    .filter-control select:open::picker-icon {
        rotate: 180deg;
    }
}

</style>

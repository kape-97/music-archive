<script>
  import { invalidateAll } from "$app/navigation";

  /** @type {import('./$types').PageProps} */
  let { data } = $props();

  let title = $state("");
  let artist = $state("");
  let album = $state("");

  let artistSuggestionsOpen = $state(false);
  let albumSuggestionsOpen = $state(false);

  let activeArtistSuggestion = $state(-1);
  let activeAlbumSuggestion = $state(-1);

  let year = $state("");
  let durationMinutes = $state("");
  let durationRemainder = $state("");

  let selectedLanguageId = $state("");
  let selectedGenreId = $state("");

  /** @type {number[]} */
  let selectedMoodIds = $state([]);

  /** @type {number[]} */
  let selectedCategoryIds = $state([]);

  let isSubmitting = $state(false);
  let uploadError = $state("");
  let uploadSuccess = $state("");

  let coverPreviewUrl = $state("");
  let coverImageError = $state("");

/** @type {HTMLInputElement | null} */
let coverInputElement = $state(null);

  // Automatically dismiss notifications.
// Errors remain visible slightly longer so they can be read.
$effect(() => {
  const message = uploadError || uploadSuccess;

  if (!message) return;

  const timeout = setTimeout(
    () => {
      uploadError = "";
      uploadSuccess = "";
    },
    uploadError ? 8000 : 6500
  );

  return () => clearTimeout(timeout);
});

  const languages = $derived(
    data.classifications.filter(
      (item) => item.type === "LANGUAGE"
    )
  );

  const genres = $derived(
    data.classifications.filter(
      (item) => item.type === "GENRE"
    )
  );

  const moods = $derived(
    data.classifications.filter(
      (item) => item.type === "MOOD"
    )
  );

  const categories = $derived(
    data.classifications.filter(
      (item) => item.type === "CATEGORY"
    )
  );

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MAX_AUTOCOMPLETE_RESULTS = 8;
  const MAX_COVER_BYTES = 5 * 1024 * 1024;

  // Filter the existing database-backed suggestions as the
  // administrator types. A blank query shows up to eight options.
  const filteredArtists = $derived(
    (data.existingArtists ?? [])
      .filter((existingArtist) =>
        existingArtist
          .toLocaleLowerCase()
          .includes(artist.trim().toLocaleLowerCase())
      )
      .slice(0, MAX_AUTOCOMPLETE_RESULTS)
  );

  const filteredAlbums = $derived(
    (data.existingAlbums ?? [])
      .filter((existingAlbum) =>
        existingAlbum
          .toLocaleLowerCase()
          .includes(album.trim().toLocaleLowerCase())
      )
      .slice(0, MAX_AUTOCOMPLETE_RESULTS)
  );

  /** @param {string} value */
  function selectArtistSuggestion(value) {
    artist = value;
    artistSuggestionsOpen = false;
    activeArtistSuggestion = -1;
  }

  /** @param {string} value */
  function selectAlbumSuggestion(value) {
    album = value;
    albumSuggestionsOpen = false;
    activeAlbumSuggestion = -1;
  }

  /** @param {KeyboardEvent} event */
  function handleArtistKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      artistSuggestionsOpen = true;

      if (filteredArtists.length > 0) {
        activeArtistSuggestion =
          activeArtistSuggestion < filteredArtists.length - 1
            ? activeArtistSuggestion + 1
            : 0;
      }

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      artistSuggestionsOpen = true;

      if (filteredArtists.length > 0) {
        activeArtistSuggestion =
          activeArtistSuggestion <= 0
            ? filteredArtists.length - 1
            : activeArtistSuggestion - 1;
      }

      return;
    }

    if (event.key === "Enter" && artistSuggestionsOpen) {
      event.preventDefault();

      if (filteredArtists.length > 0) {
        const index = Math.min(
          Math.max(activeArtistSuggestion, 0),
          filteredArtists.length - 1
        );

        const selectedArtist = filteredArtists[index];

        if (selectedArtist !== undefined) {
          selectArtistSuggestion(selectedArtist);
        }
      } else {
        artistSuggestionsOpen = false;
      }

      return;
    }

    if (event.key === "Escape" && artistSuggestionsOpen) {
      event.preventDefault();
      artistSuggestionsOpen = false;
      activeArtistSuggestion = -1;
    }
  }

  /** @param {KeyboardEvent} event */
  function handleAlbumKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      albumSuggestionsOpen = true;

      if (filteredAlbums.length > 0) {
        activeAlbumSuggestion =
          activeAlbumSuggestion < filteredAlbums.length - 1
            ? activeAlbumSuggestion + 1
            : 0;
      }

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      albumSuggestionsOpen = true;

      if (filteredAlbums.length > 0) {
        activeAlbumSuggestion =
          activeAlbumSuggestion <= 0
            ? filteredAlbums.length - 1
            : activeAlbumSuggestion - 1;
      }

      return;
    }

    if (event.key === "Enter" && albumSuggestionsOpen) {
      event.preventDefault();

      if (filteredAlbums.length > 0) {
        const index = Math.min(
          Math.max(activeAlbumSuggestion, 0),
          filteredAlbums.length - 1
        );

        const selectedAlbum = filteredAlbums[index];

        if (selectedAlbum !== undefined) {
          selectAlbumSuggestion(selectedAlbum);
        }
      } else {
        albumSuggestionsOpen = false;
      }

      return;
    }

    if (event.key === "Escape" && albumSuggestionsOpen) {
      event.preventDefault();
      albumSuggestionsOpen = false;
      activeAlbumSuggestion = -1;
    }
  }

  /**
   * Convert duration inputs into whole seconds.
   *
   * @returns {number | null}
   */
  function getDurationSeconds() {
    const minutesText = String(
      durationMinutes ?? ""
    ).trim();

    const secondsText = String(
      durationRemainder ?? ""
    ).trim();

    if (minutesText === "" && secondsText === "") {
      return null;
    }

    if (
      (minutesText !== "" && !/^\d+$/.test(minutesText)) ||
      (secondsText !== "" && !/^\d+$/.test(secondsText))
    ) {
      throw new Error(
        "Enter duration using whole minutes and seconds."
      );
    }

    const minutes =
      minutesText === "" ? 0 : Number(minutesText);

    const seconds =
      secondsText === "" ? 0 : Number(secondsText);

    if (
      !Number.isSafeInteger(minutes) ||
      minutes < 0 ||
      !Number.isSafeInteger(seconds) ||
      seconds < 0 ||
      seconds > 59
    ) {
      throw new Error(
        "Minutes must be non-negative and seconds must be between 0 and 59."
      );
    }

    const totalSeconds = minutes * 60 + seconds;

    if (!Number.isSafeInteger(totalSeconds)) {
      throw new Error(
        "The duration is outside the supported range."
      );
    }

    return totalSeconds;
  }

/**
 * Clear the selected cover artwork and release its preview URL.
 */
function clearCoverArtwork() {
  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
  }

  coverPreviewUrl = "";
  coverImageError = "";

  if (coverInputElement) {
    coverInputElement.value = "";
  }
}

/**
 * Validate the selected cover image and generate its preview.
 *
 * @param {Event} event
 */
  function handleCoverChange(event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget);
  const file = input.files?.[0];

  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
  }

  coverPreviewUrl = "";
  coverImageError = "";

  if (!file) return;

  if (file.size > MAX_COVER_BYTES) {
    coverImageError = "Cover image must not exceed 5 MiB.";
    input.value = "";
    return;
  }

  const allowedExtensions = /\.(jpg|jpeg|png|webp)$/i;

  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  if (
    !allowedExtensions.test(file.name) ||
    (file.type && !allowedTypes.has(file.type.toLowerCase()))
  ) {
    coverImageError = "Choose a JPEG, PNG or WebP image.";
    input.value = "";
    return;
  }

  coverPreviewUrl = URL.createObjectURL(file);
}

  /**
   * Reset all fields after a successful upload.
   *
   * @param {HTMLFormElement} formElement
   */
  function resetForm(formElement) {
    formElement.reset();

    title = "";
    artist = "";
    album = "";

    artistSuggestionsOpen = false;
    albumSuggestionsOpen = false;

    activeArtistSuggestion = -1;
    activeAlbumSuggestion = -1;

    year = "";

    durationMinutes = "";
    durationRemainder = "";

    selectedLanguageId = "";
    selectedGenreId = "";

    selectedMoodIds = [];
    selectedCategoryIds = [];
    clearCoverArtwork();
  }

  /**
   * Upload an MP3 through the existing protected song-creation API.
   *
   * The backend stores audio in R2 and metadata in MySQL.
   *
   * @param {SubmitEvent} event
   */
  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    uploadError = "";
    uploadSuccess = "";

    const formElement =
      /** @type {HTMLFormElement} */ (event.currentTarget);

    // Read the form before setting the submitting state, so
    // disabling its fieldset cannot exclude any form fields.
    const formData = new FormData(formElement);

    const normalizedTitle = String(title ?? "").trim();
    const normalizedArtist = String(artist ?? "").trim();
    const normalizedAlbum = String(album ?? "").trim();
    const normalizedYear = String(year ?? "").trim();

    if (!normalizedTitle || !normalizedArtist) {
      uploadError = "Song title and artist are required.";
      return;
    }

    if (
      normalizedTitle.length > 191 ||
      normalizedArtist.length > 191 ||
      normalizedAlbum.length > 191
    ) {
      uploadError =
        "Title, artist and album must not exceed 191 characters.";
      return;
    }

    let parsedYear = null;

    if (normalizedYear !== "") {
      if (
        !/^\d{4}$/.test(normalizedYear) ||
        Number(normalizedYear) < 1000 ||
        Number(normalizedYear) > 9999
      ) {
        uploadError = "Enter a valid four-digit release year.";
        return;
      }

      parsedYear = Number(normalizedYear);
    }

    let parsedDuration;

    try {
      parsedDuration = getDurationSeconds();
    } catch (error) {
      uploadError =
        error instanceof Error
          ? error.message
          : "Please check the duration.";

      return;
    }

    const audioFile = formData.get("audioFile");

    if (
      typeof File === "undefined" ||
      !(audioFile instanceof File) ||
      audioFile.size === 0
    ) {
      uploadError = "Please select a non-empty MP3 file.";
      return;
    }

    if (!audioFile.name.toLowerCase().endsWith(".mp3")) {
      uploadError = "Only MP3 files are accepted.";
      return;
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      uploadError = "The MP3 file must not exceed 25 MiB.";
      return;
    }

    if (!selectedLanguageId || !selectedGenreId) {
      uploadError = "Select one language and one genre.";
      return;
    }

    // Normalize text inputs and replace the two duration fields
    // with the total seconds expected by the existing POST API.
    formData.set("title", normalizedTitle);
    formData.set("artist", normalizedArtist);
    formData.set("album", normalizedAlbum);
    formData.set(
      "year",
      parsedYear === null ? "" : String(parsedYear)
    );

    formData.delete("durationMinutes");
    formData.delete("durationRemainder");

    formData.set(
      "durationSeconds",
      parsedDuration === null ? "" : String(parsedDuration)
    );

    // The classification checkboxes already contribute repeated
    // moodIds and categoryIds entries to FormData.
    isSubmitting = true;

    try {
      const response = await fetch("/api/admin/songs", {
        method: "POST",
        body: formData
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        uploadError =
          typeof result?.error === "string"
            ? result.error
            : "Unable to upload the song. Please try again.";

        return;
      }

      const savedTitle =
        typeof result?.song?.title === "string"
          ? result.song.title
          : normalizedTitle;

      resetForm(formElement);

      uploadSuccess = `"${savedTitle}" was saved as a draft.`;

      // Refresh the page's server data, including artist and album
      // suggestions, so the newly saved values become available.
      try {
        await invalidateAll();
      } catch (error) {
        console.error(
          "Song uploaded, but page data could not be refreshed:",
          error
        );
        
        uploadSuccess =`"${savedTitle}" was saved as a draft, but artist and album suggestions could not be refreshed. Reload this page to see the latest suggestions.`;
      }
    } catch (error) {
      console.error("Song upload request failed:", error);

      uploadError =
        "Unable to connect to the server. Check your connection and try again.";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Song Upload | Music Archive</title>
</svelte:head>

<div class="upload-page">
  <section class="page-intro">
    <div>
      <p class="eyebrow">COLLECTION MANAGEMENT</p>
      <h2>Upload a song</h2>
      <p>
        Add a track and organise its metadata before it enters your library.
      </p>
    </div>

    <a class="secondary-link" href="/admin/songs">
      View Music Library
    </a>
  </section>

  {#if uploadError || uploadSuccess}
  <div class="toast-viewport">
    <div
      class="toast-card"
      class:toast-card-error={Boolean(uploadError)}
      class:toast-card-success={!uploadError && Boolean(uploadSuccess)}
      role={uploadError ? "alert" : "status"}
      aria-live={uploadError ? "assertive" : "polite"}
    >
      <span class="toast-symbol" aria-hidden="true">
        {#if uploadError}
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8v5m0 3h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="m7 12.5 3.3 3.3L17.5 8"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        {/if}
      </span>

      <div class="toast-content">
        <p class="toast-heading">
          {uploadError ? "Upload failed" : "Song uploaded successfully"}
        </p>

        <p class="toast-description">
          {uploadError || uploadSuccess}
        </p>

        {#if uploadSuccess}
          <a class="toast-action" href="/admin/songs">
            Click here to view the Music Library
            <span aria-hidden="true">→</span>
          </a>
        {/if}
      </div>

      <button
        class="toast-dismiss"
        type="button"
        aria-label="Dismiss notification"
        onclick={() => {
          uploadError = "";
          uploadSuccess = "";
        }}
      >
        ×
      </button>
    </div>
  </div>
{/if}

  <section class="form-panel" aria-labelledby="upload-heading">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">NEW MUSIC</p>
        <h2 id="upload-heading">Song information</h2>
        <p>
          Fields marked with an asterisk are required.
        </p>
      </div>
    </div>

    <form
      class="song-form"
      onsubmit={handleSubmit}
    >
      <fieldset disabled={isSubmitting}>
        <legend>Basic metadata</legend>

        <div class="form-grid">
          <div class="field">
            <label for="upload-title">Song title *</label>

            <input
              id="upload-title"
              name="title"
              type="text"
              bind:value={title}
              maxlength="191"
              autocomplete="off"
              placeholder="Enter song title"
              required
            />
          </div>

          <!-- Custom Artist autocomplete -->
          <div class="field">
            <label for="upload-artist">Artist *</label>

            <div class="autocomplete">
              <input
                id="upload-artist"
                name="artist"
                type="text"
                bind:value={artist}
                maxlength="191"
                autocomplete="off"
                placeholder="Choose or type an artist"
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={artistSuggestionsOpen}
                aria-controls="artist-suggestions"
                aria-activedescendant={activeArtistSuggestion >= 0
                  ? `artist-option-${activeArtistSuggestion}`
                  : undefined}
                onfocus={() => {
                  artistSuggestionsOpen = true;
                  activeArtistSuggestion = -1;
                }}
                oninput={() => {
                  artistSuggestionsOpen = true;
                  activeArtistSuggestion = -1;
                }}
                onkeydown={handleArtistKeydown}
                onblur={() => {
                  artistSuggestionsOpen = false;
                  activeArtistSuggestion = -1;
                }}
                required
              />

              <span
                class="autocomplete-indicator"
                class:open={artistSuggestionsOpen}
                aria-hidden="true"
              >⌄</span>

              {#if artistSuggestionsOpen}
                <div
                  class="autocomplete-menu"
                  id="artist-suggestions"
                  role="listbox"
                  aria-label="Existing artists"
                >
                  {#if filteredArtists.length > 0}
                    {#each filteredArtists as existingArtist, index (existingArtist)}
                      <button
                        id={`artist-option-${index}`}
                        class="autocomplete-option"
                        class:active={activeArtistSuggestion === index}
                        type="button"
                        role="option"
                        aria-selected={activeArtistSuggestion === index}
                        onpointerdown={(event) => event.preventDefault()}
                        onmouseenter={() => (activeArtistSuggestion = index)}
                        onclick={() => selectArtistSuggestion(existingArtist)}
                      >
                        {existingArtist}
                      </button>
                    {/each}

                    <div class="autocomplete-footer">
                      Use ↑ ↓ to navigate · Enter to select
                    </div>
                  {:else}
                    <div class="autocomplete-empty" role="status">
                      No matching artists. You can still enter a new name.
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <small>
              Choose an existing artist or type a new name.
            </small>
          </div>

          <!-- Custom Album autocomplete -->
          <div class="field">
            <label for="upload-album">Album</label>

            <div class="autocomplete">
              <input
                id="upload-album"
                name="album"
                type="text"
                bind:value={album}
                maxlength="191"
                autocomplete="off"
                placeholder="Choose or type an album"
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={albumSuggestionsOpen}
                aria-controls="album-suggestions"
                aria-activedescendant={activeAlbumSuggestion >= 0
                  ? `album-option-${activeAlbumSuggestion}`
                  : undefined}
                onfocus={() => {
                  albumSuggestionsOpen = true;
                  activeAlbumSuggestion = -1;
                }}
                oninput={() => {
                  albumSuggestionsOpen = true;
                  activeAlbumSuggestion = -1;
                }}
                onkeydown={handleAlbumKeydown}
                onblur={() => {
                  albumSuggestionsOpen = false;
                  activeAlbumSuggestion = -1;
                }}
              />

              <span
                class="autocomplete-indicator"
                class:open={albumSuggestionsOpen}
                aria-hidden="true"
              >⌄</span>

              {#if albumSuggestionsOpen}
                <div
                  class="autocomplete-menu"
                  id="album-suggestions"
                  role="listbox"
                  aria-label="Existing albums"
                >
                  {#if filteredAlbums.length > 0}
                    {#each filteredAlbums as existingAlbum, index (existingAlbum)}
                      <button
                        id={`album-option-${index}`}
                        class="autocomplete-option"
                        class:active={activeAlbumSuggestion === index}
                        type="button"
                        role="option"
                        aria-selected={activeAlbumSuggestion === index}
                        onpointerdown={(event) => event.preventDefault()}
                        onmouseenter={() => (activeAlbumSuggestion = index)}
                        onclick={() => selectAlbumSuggestion(existingAlbum)}
                      >
                        {existingAlbum}
                      </button>
                    {/each}

                    <div class="autocomplete-footer">
                      Use ↑ ↓ to navigate · Enter to select
                    </div>
                  {:else}
                    <div class="autocomplete-empty" role="status">
                      No matching albums. You can still enter a new name.
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <small>
              Optional. New album names are saved with the song.
            </small>
          </div>

          <div class="field">
            <label for="upload-year">Release year</label>

            <input
              id="upload-year"
              name="year"
              type="number"
              bind:value={year}
              min="1000"
              max="9999"
              step="1"
              placeholder="e.g. 2024"
            />

            <small>Leave blank if unknown.</small>
          </div>
        </div>

        <div class="duration-section">
          <div class="section-heading">
            <h3>Track duration</h3>
            <p>Enter the duration as minutes and seconds.</p>
          </div>

          <div class="duration-inputs">
            <div class="field">
              <label for="upload-duration-minutes">Minutes</label>

              <input
                id="upload-duration-minutes"
                name="durationMinutes"
                type="number"
                bind:value={durationMinutes}
                min="0"
                step="1"
                placeholder="0"
              />
            </div>

            <span class="duration-colon" aria-hidden="true">:</span>

            <div class="field">
              <label for="upload-duration-seconds">Seconds</label>

              <input
                id="upload-duration-seconds"
                name="durationRemainder"
                type="number"
                bind:value={durationRemainder}
                min="0"
                max="59"
                step="1"
                placeholder="00"
              />
            </div>
          </div>

          <small class="field-hint">
            Both fields are optional. Seconds must be between 0 and 59.
          </small>
        </div>

        <div class="section-divider"></div>

<div class="section-heading">
  <h3>Cover artwork</h3>
  <p>
    Add optional artwork for this song. It will appear in your music library
    and future public catalogue.
  </p>
</div>

<div class="field file-field cover-art-field">
  <label for="upload-cover">Cover image</label>

  <input
    bind:this={coverInputElement}
    id="upload-cover"
    name="coverFile"
    type="file"
    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
    onchange={handleCoverChange}
  />

  <small>
    Optional. JPEG, PNG or WebP. Maximum size: 5 MiB.
  </small>

  {#if coverImageError}
    <small class="cover-image-error" role="alert">
      {coverImageError}
    </small>
  {/if}

  {#if coverPreviewUrl}
    <div class="cover-preview">
      <img
        src={coverPreviewUrl}
        alt="Selected song cover artwork"
      />

      <div class="cover-preview-details">
        <span>Cover artwork selected</span>

        <button
          class="secondary-button"
          type="button"
          onclick={clearCoverArtwork}
        >
          Remove image
        </button>
      </div>
    </div>
  {/if}
</div>

        <div class="section-divider"></div>

        <div class="section-heading">
          <h3>Primary classifications</h3>
          <p>Choose one language and one genre.</p>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="upload-language">Language *</label>

            <select
              id="upload-language"
              name="languageId"
              bind:value={selectedLanguageId}
              required
            >
              <option value="">Choose a language</option>

              {#each languages as item (item.id)}
                <option value={String(item.id)}>
                  {item.name}
                </option>
              {/each}
            </select>

            {#if languages.length === 0}
              <small>
                No languages are configured. Contact the administrator.
              </small>
            {/if}
          </div>

          <div class="field">
            <label for="upload-genre">Genre *</label>

            <select
              id="upload-genre"
              name="genreId"
              bind:value={selectedGenreId}
              required
            >
              <option value="">Choose a genre</option>

              {#each genres as item (item.id)}
                <option value={String(item.id)}>
                  {item.name}
                </option>
              {/each}
            </select>

            {#if genres.length === 0}
              <small>
                Add a genre in
                <a href="/admin/classifications">Classifications</a>
                before uploading.
              </small>
            {/if}
          </div>
        </div>

        <div class="section-divider"></div>

        <div class="section-heading">
          <h3>Moods</h3>
          <p>Select any number of moods that describe the track.</p>
        </div>

        {#if moods.length > 0}
          <div class="choice-grid">
            {#each moods as item (item.id)}
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
        {:else}
          <p class="empty-options">
            No moods configured.
            <a href="/admin/classifications">Manage classifications</a>.
          </p>
        {/if}

        <div class="section-divider"></div>

        <div class="section-heading">
          <h3>General categories</h3>
          <p>
            Optional labels that can group songs across different genres and moods.
          </p>
        </div>

        {#if categories.length > 0}
          <div class="choice-grid">
            {#each categories as item (item.id)}
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
        {:else}
          <p class="empty-options">
            No general categories configured.
            <a href="/admin/classifications">Manage classifications</a>.
          </p>
        {/if}

        <div class="section-divider"></div>

        <div class="section-heading">
          <h3>Audio file</h3>
          <p>
            The selected MP3 will be uploaded to your private R2 bucket.
          </p>
        </div>

        <div class="field file-field">
          <label for="upload-audio">MP3 file *</label>

          <input
            id="upload-audio"
            name="audioFile"
            type="file"
            accept=".mp3,audio/mpeg"
            required
          />

          <small>
            MP3 only. Maximum size: 25 MiB.
          </small>
        </div>
      </fieldset>

      <div class="form-actions">
        <button
          class="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Uploading song..." : "Upload song"}
        </button>

        <button
          class="secondary-button"
          type="reset"
          disabled={isSubmitting}
          onclick={() => {
            uploadError = "";
            uploadSuccess = "";

            title = "";
            artist = "";
            album = "";

            artistSuggestionsOpen = false;
            albumSuggestionsOpen = false;

            activeArtistSuggestion = -1;
            activeAlbumSuggestion = -1;

            year = "";

            durationMinutes = "";
            durationRemainder = "";

            selectedLanguageId = "";
            selectedGenreId = "";

            selectedMoodIds = [];
            selectedCategoryIds = [];
            clearCoverArtwork();
          }}
        >
          Clear form
        </button>

        <span class="required-note">* Required fields</span>
      </div>
    </form>
  </section>

  <p class="page-note">
    Uploaded songs are saved as drafts. Publishing controls will be
    implemented separately. Metadata and classifications are stored
    in MySQL, while audio files remain in private Cloudflare R2 storage.
  </p>
</div>

<style>
  .upload-page {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
    padding: 30px 32px 44px;
  }

  .page-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 25px;
  }

  .eyebrow {
    margin: 0 0 9px;
    color: #d9b87b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }

  .page-intro h2 {
    margin: 0 0 8px;
    font-size: 25px;
    font-weight: 650;
    letter-spacing: -0.03em;
  }

  .page-intro > div > p:last-child {
    margin: 0;
    color: #aab4c6;
    font-size: 12px;
    line-height: 1.7;
  }

  .secondary-link {
    display: inline-flex;
    min-height: 38px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    padding: 9px 12px;
    border: 1px solid #40495c;
    border-radius: 7px;
    color: #d6dceb;
    font-size: 11px;
    text-decoration: none;
  }

  .secondary-link:hover {
    border-color: #d9b87b;
    color: #f0d29b;
  }


  .form-panel {
    overflow: hidden;
    border: 1px solid #293144;
    border-radius: 12px;
    background: #111827;
  }

  .panel-heading {
    padding: 21px 24px;
    border-bottom: 1px solid #293144;
  }

  .panel-heading h2 {
    margin: 0 0 7px;
    font-size: 16px;
    font-weight: 600;
  }

  .panel-heading p:last-child {
    margin: 0;
    color: #929cb1;
    font-size: 11px;
    line-height: 1.7;
  }

  .song-form {
    padding: 24px;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  fieldset > legend {
    margin-bottom: 20px;
    padding: 0;
    color: #eef1f7;
    font-size: 13px;
    font-weight: 650;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
  }

  .field > label {
    color: #d6dceb;
    font-size: 11px;
    font-weight: 600;
  }

  .field input:not([type="checkbox"]),
  .field select {
    width: 100%;
    min-width: 0;
    min-height: 43px;
    padding: 11px 12px;
    border: 1px solid #394258;
    border-radius: 7px;
    outline: none;
    background: #0c1322;
    color: #eef1f7;
    color-scheme: dark;
    font: inherit;
    font-size: 12px;
  }

  .field input::placeholder {
    color: #6f7a91;
  }

  .field input:focus,
  .field select:focus {
    border-color: #d9b87b;
    box-shadow: 0 0 0 2px rgb(217 184 123 / 12%);
  }

  /* Custom autocomplete container and caret */
  .autocomplete {
    position: relative;
    width: 100%;
  }

  .autocomplete > input {
    padding-right: 38px;
  }

  .autocomplete-indicator {
    position: absolute;
    top: 50%;
    right: 13px;
    color: #929cb1;
    font-size: 17px;
    line-height: 1;
    pointer-events: none;
    transform: translateY(-58%);
    transition:
      color 120ms ease,
      transform 120ms ease;
  }

  .autocomplete:focus-within .autocomplete-indicator {
    color: #d9b87b;
  }

  .autocomplete-indicator.open {
    transform: translateY(-35%) rotate(180deg);
  }

  /* Navy dropdown styled to match the admin workspace */
  .autocomplete-menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    max-height: 260px;
    overflow-y: auto;
    padding: 5px;
    border: 1px solid #303b50;
    border-radius: 9px;
    background: #111827;
    box-shadow: 0 14px 34px rgb(0 0 0 / 42%);
    scrollbar-color: #46516a #111827;
    scrollbar-width: thin;
  }

  .autocomplete-option {
    display: block;
    width: 100%;
    min-height: 37px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #d6dceb;
    font: inherit;
    font-size: 12px;
    line-height: 1.45;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
    transition:
      background 100ms ease,
      color 100ms ease,
      border-color 100ms ease;
  }

  .autocomplete-option:hover,
  .autocomplete-option.active {
    border-color: #5e5037;
    background: #29271f;
    color: #f0d29b;
  }

  .autocomplete-option:focus-visible {
    outline: 2px solid #d9b87b;
    outline-offset: -2px;
  }

  .autocomplete-footer {
    margin-top: 4px;
    padding: 8px 10px 5px;
    border-top: 1px solid #293144;
    color: #7f8ba2;
    font-size: 9px;
    line-height: 1.5;
  }

  .autocomplete-empty {
    padding: 12px 10px;
    color: #aab4c6;
    font-size: 11px;
    line-height: 1.6;
  }

  .field small,
  .field-hint,
  .empty-options {
    color: #929cb1;
    font-size: 10px;
    line-height: 1.8;
  }

  .field small a,
  .empty-options a {
    color: #e4c58e;
    text-underline-offset: 3px;
  }

  .duration-section {
    max-width: 530px;
    margin-top: 25px;
  }

  .section-heading {
    margin-bottom: 14px;
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
    line-height: 1.8;
  }

  .duration-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: start;
    gap: 13px;
  }

  .duration-colon {
    margin-top: 30px;
    color: #d9b87b;
    font-size: 20px;
  }

  .field-hint {
    display: block;
    margin-top: 9px;
  }

  .section-divider {
    height: 1px;
    margin: 27px 0;
    background: #293144;
  }

  .choice-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .choice {
    display: inline-flex;
    min-height: 39px;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border: 1px solid #394258;
    border-radius: 7px;
    background: #171f30;
    color: #d6dceb;
    font-size: 11px;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .choice:hover {
    border-color: #716249;
    background: #1d2638;
  }

  .choice input {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: #d9b87b;
    cursor: pointer;
  }

  .choice:has(input:checked) {
    border-color: #8e754d;
    background: #2a261f;
    color: #f0d29b;
  }

  .empty-options {
    margin: 0;
  }

  .file-field {
    max-width: 650px;
  }

  .file-field input[type="file"] {
    min-height: auto;
    padding: 10px;
  }

  .file-field input[type="file"]::file-selector-button {
    margin-right: 12px;
    padding: 8px 10px;
    border: 1px solid #40495c;
    border-radius: 6px;
    background: #20283a;
    color: #e2e6ef;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .cover-preview {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  padding: 14px;
  border: 1px solid #394258;
  border-radius: 9px;
  background: #171f30;
}

.cover-preview img {
  width: 110px;
  height: 110px;
  flex: 0 0 110px;
  border: 1px solid #394258;
  border-radius: 7px;
  background: #0c1322;
  object-fit: cover;
}

.cover-preview-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  color: #d6dceb;
  font-size: 11px;
}

.cover-image-error {
  color: #ff9b9b !important;
}

  .form-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 28px;
    padding-top: 22px;
    border-top: 1px solid #293144;
  }

  .primary-button,
  .secondary-button {
    display: inline-flex;
    min-height: 39px;
    align-items: center;
    justify-content: center;
    padding: 10px 16px;
    border-radius: 7px;
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
  }

  .primary-button {
    border: 1px solid #d9b87b;
    background: #d9b87b;
    color: #151a28;
  }

  .primary-button:hover:not(:disabled) {
    border-color: #f0d29b;
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

  .required-note {
    margin-left: auto;
    color: #808ba1;
    font-size: 10px;
  }

  .page-note {
    margin: 17px 0 0;
    color: #808ba1;
    font-size: 11px;
    line-height: 1.8;
  }

  /* Floating toast notification */
.toast-viewport {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.toast-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 15px 14px;
  border: 1px solid;
  border-radius: 12px;
  background: #111827;
  box-shadow: 0 18px 45px rgb(0 0 0 / 42%);
  pointer-events: auto;
  animation: toast-enter 180ms ease-out;
}

.toast-card-success {
  border-color: #305a4b;
}

.toast-card-error {
  border-color: #713b43;
}

.toast-symbol {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 50%;
}

.toast-symbol svg {
  width: 21px;
  height: 21px;
}

.toast-card-success .toast-symbol {
  background: #1c342e;
  color: #8de0b3;
}

.toast-card-error .toast-symbol {
  background: #321d28;
  color: #ffb5ba;
}

.toast-content {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 5px;
}

.toast-heading {
  margin: 1px 0 0;
  color: #eef1f7;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.5;
}

.toast-description {
  margin: 0;
  color: #aab4c6;
  font-size: 11px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.toast-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  margin-top: 3px;
  color: #e4c58e;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  text-decoration: none;
  text-underline-offset: 3px;
}

.toast-action:hover {
  color: #f0d29b;
  text-decoration: underline;
}

.toast-dismiss {
  display: grid;
  width: 27px;
  height: 27px;
  flex: 0 0 27px;
  place-items: center;
  margin: -5px -5px 0 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #929cb1;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.toast-dismiss:hover {
  border-color: #394258;
  background: #20283a;
  color: #eef1f7;
}

.toast-dismiss:focus-visible,
.toast-action:focus-visible {
  outline: 2px solid #d9b87b;
  outline-offset: 3px;
}

@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 480px) {
  .toast-viewport {
    top: 12px;
    right: 12px;
    width: calc(100vw - 24px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-card {
    animation: none;
  }
}

  @media (max-width: 760px) {
    .upload-page {
      padding: 22px 15px 30px;
    }

    .page-intro {
      align-items: flex-start;
      flex-direction: column;
    }

    .page-intro h2 {
      font-size: 22px;
    }

    .form-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 17px;
    }

    .panel-heading,
    .song-form {
      padding: 18px;
    }

    .form-actions {
      align-items: stretch;
    }

    .primary-button,
    .secondary-button {
      flex: 1 1 auto;
    }

    .required-note {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
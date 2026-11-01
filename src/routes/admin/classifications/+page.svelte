
<script>
  /** @type {import('./$types').PageProps} */
  let { data } = $props();

  /**
   * @typedef {{ id: number, type: string, name: string, slug: string }} Classification
   */

  /** @type {Classification[]} */
  let classifications = $state([]);

  // Keep the local editable list aligned when SvelteKit reloads page data.
  $effect(() => {
    classifications = data.classifications;
  });

  let selectedFilter = $state("ALL");
  let classificationSearch = $state("");
  let newType = $state("GENRE");
  let newName = $state("");

  /** @type {number | null} */
  let editingId = $state(null);
  let editingName = $state("");
  let isCreating = $state(false);

  /** @type {number | null} */
  let busyId = $state(null);

  let pageError = $state("");
  let pageMessage = $state("");

  const filterOptions = [
    { value: "ALL", label: "All options" },
    { value: "LANGUAGE", label: "Languages" },
    { value: "GENRE", label: "Genres" },
    { value: "MOOD", label: "Moods" },
    { value: "CATEGORY", label: "Categories" }
  ];

  /**
   * Sort classifications consistently by type and then by name.
   * @param {Classification[]} items
   * @returns {Classification[]}
   */
  function sortClassifications(items) {
    return [...items].sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }

  let filteredClassifications = $derived(
    classifications.filter((item) => {
      const matchesType =
        selectedFilter === "ALL" || item.type === selectedFilter;
      const query = classificationSearch.trim().toLocaleLowerCase();
      const matchesSearch =
        !query ||
        item.name.toLocaleLowerCase().includes(query) ||
        item.slug.toLocaleLowerCase().includes(query);

      return matchesType && matchesSearch;
    })
  );

  /**
   * Count classifications represented by a filter tab.
   * @param {string} type
   * @returns {number}
   */
  function countForFilter(type) {
    return type === "ALL"
      ? classifications.length
      : classifications.filter((item) => item.type === type).length;
  }

  /**
   * Convert an internal classification type into a display label.
   * @param {string} type
   * @returns {string}
   */
  function typeLabel(type) {
    /** @type {Record<string, string>} */
    const labels = {
      LANGUAGE: "Language",
      GENRE: "Genre",
      MOOD: "Mood",
      CATEGORY: "Category"
    };

    return labels[type] || type;
  }

  /**
   * Safely extract an API error message.
   * @param {any} result
   * @param {string} fallback
   * @returns {string}
   */
  function getErrorMessage(result, fallback) {
    return typeof result?.error === "string" ? result.error : fallback;
  }

  /**
   * Add a new genre, mood, or category.
   * @param {SubmitEvent} event
   */
  async function handleCreate(event) {
    event.preventDefault();

    if (isCreating || busyId !== null) return;

    const name = newName.trim();

    if (!name) {
      pageError = "Enter a classification name.";
      pageMessage = "";
      return;
    }

    pageError = "";
    pageMessage = "";
    isCreating = true;

    try {
      const response = await fetch("/api/admin/classifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, name })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        pageError = getErrorMessage(result, "Unable to create classification.");
        return;
      }

      if (!result?.classification) {
        pageError = "The server returned an unexpected response.";
        return;
      }

      classifications = sortClassifications([
        ...classifications,
        result.classification
      ]);
      newName = "";
      selectedFilter = newType;
      classificationSearch = "";
      pageMessage = `${typeLabel(newType)} created successfully.`;
    } catch {
      pageError = "Unable to connect to the server.";
    } finally {
      isCreating = false;
    }
  }

  /**
   * Begin editing a classification.
   * @param {Classification} classification
   */
  function beginEdit(classification) {
    if (busyId !== null || isCreating) return;

    editingId = classification.id;
    editingName = classification.name;
    pageError = "";
    pageMessage = "";
  }

  function cancelEdit() {
    editingId = null;
    editingName = "";
    pageError = "";
  }

  /**
   * Save a classification name.
   * @param {Classification} classification
   */
  async function saveEdit(classification) {
    if (busyId !== null || isCreating) return;

    const name = editingName.trim();

    if (!name) {
      pageError = "Classification name cannot be empty.";
      return;
    }

    pageError = "";
    pageMessage = "";
    busyId = classification.id;

    try {
      const response = await fetch(
        `/api/admin/classifications/${classification.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        pageError = getErrorMessage(result, "Unable to update classification.");
        return;
      }

      if (!result?.classification) {
        pageError = "The server returned an unexpected response.";
        return;
      }

      classifications = sortClassifications(
        classifications.map((item) =>
          item.id === classification.id ? result.classification : item
        )
      );

      editingId = null;
      editingName = "";
      pageMessage = "Classification updated successfully.";
    } catch {
      pageError = "Unable to connect to the server.";
    } finally {
      busyId = null;
    }
  }

  /**
   * Delete an unused classification.
   * @param {Classification} classification
   */
  async function handleDelete(classification) {
    if (busyId !== null || isCreating) return;

    const confirmed = window.confirm(
      `Delete "${classification.name}" from ${typeLabel(classification.type).toLowerCase()} options?`
    );

    if (!confirmed) return;

    pageError = "";
    pageMessage = "";
    busyId = classification.id;

    try {
      const response = await fetch(
        `/api/admin/classifications/${classification.id}`,
        { method: "DELETE" }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        pageError = getErrorMessage(result, "Unable to delete classification.");
        return;
      }

      classifications = classifications.filter(
        (item) => item.id !== classification.id
      );

      if (editingId === classification.id) {
        editingId = null;
        editingName = "";
      }

      pageMessage = "Classification deleted successfully.";
    } catch {
      pageError = "Unable to connect to the server.";
    } finally {
      busyId = null;
    }
  }
</script>

<svelte:head>
  <title>Classifications | Music Archive</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="classifications-page">
  <main class="content" aria-label="Classification management">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/admin">Dashboard</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Classifications</span>
    </nav>

    <!-- The shared admin layout supplies the page title, navigation and footer. -->
    <section class="page-intro" aria-label="Classification overview">
      <div class="intro-copy">
        <p class="eyebrow">COLLECTION MANAGEMENT</p>
        <p class="subtitle">
          Manage the language, genre, mood and category options used throughout your music archive.
        </p>
      </div>

      <div class="count-card" aria-label={`${classifications.length} total classification options`}>
        <span>Total options</span>
        <strong>{classifications.length}</strong>
        <small>Across all types</small>
      </div>
    </section>

    {#if pageError}
      <div class="message error-message" role="alert">
        <span class="message-icon" aria-hidden="true">!</span>
        <span>{pageError}</span>
        <button
          class="message-dismiss"
          type="button"
          aria-label="Dismiss error message"
          onclick={() => (pageError = "")}
        >×</button>
      </div>
    {/if}

    {#if pageMessage}
      <div class="message success-message" role="status">
        <span class="message-icon" aria-hidden="true">✓</span>
        <span>{pageMessage}</span>
        <button
          class="message-dismiss"
          type="button"
          aria-label="Dismiss success message"
          onclick={() => (pageMessage = "")}
        >×</button>
      </div>
    {/if}

    <section class="management-panel create-panel" aria-labelledby="create-heading">
      <div class="panel-heading">
        <div class="panel-title-group">
          <span class="panel-icon" aria-hidden="true">＋</span>
          <div>
            <h2 id="create-heading">Add a classification</h2>
            <p>Create reusable genres, moods and general categories. Languages are fixed.</p>
          </div>
        </div>
        <span class="section-kicker">NEW OPTION</span>
      </div>

      <form class="create-form" onsubmit={handleCreate}>
        <label class="type-field" for="new-classification-type">
          <span>Classification type</span>
          <select
            id="new-classification-type"
            bind:value={newType}
            disabled={isCreating || busyId !== null}
          >
            <option value="GENRE">Genre</option>
            <option value="MOOD">Mood</option>
            <option value="CATEGORY">Category</option>
          </select>
        </label>

        <label class="name-field" for="new-classification-name">
          <span>Classification name</span>
          <input
            id="new-classification-name"
            type="text"
            bind:value={newName}
            placeholder="e.g. Electronic, Instrumental, Workout"
            maxlength="191"
            autocomplete="off"
            required
            disabled={isCreating || busyId !== null}
          />
        </label>

        <button
          class="primary-button"
          type="submit"
          disabled={isCreating || busyId !== null}
        >
          <span aria-hidden="true">{isCreating ? "…" : "+"}</span>
          {isCreating ? "Adding…" : "Add option"}
        </button>
      </form>
    </section>

    <section class="management-panel options-panel" aria-labelledby="options-heading">
      <div class="panel-heading options-heading">
        <div>
          <div class="heading-title-line">
            <h2 id="options-heading">Available options</h2>
            <span class="record-count">
              {filteredClassifications.length} shown
            </span>
          </div>
          <p>Review names and slugs. Language options cannot be renamed or deleted.</p>
        </div>
      </div>

      <div class="options-toolbar">
        <div class="filter-bar" aria-label="Filter classifications by type">
          {#each filterOptions as option (option.value)}
            <button
              type="button"
              class="filter-button"
              class:active={selectedFilter === option.value}
              aria-pressed={selectedFilter === option.value}
              onclick={() => {
                selectedFilter = option.value;
                pageError = "";
                pageMessage = "";
              }}
            >
              {option.label}
              <span class="filter-count">{countForFilter(option.value)}</span>
            </button>
          {/each}
        </div>

        <label class="options-search" for="classification-search">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input
            id="classification-search"
            type="search"
            bind:value={classificationSearch}
            placeholder="Find by name or slug…"
            autocomplete="off"
          />
          {#if classificationSearch}
            <button
              class="search-clear"
              type="button"
              aria-label="Clear classification search"
              onclick={() => (classificationSearch = "")}
            >×</button>
          {/if}
        </label>
      </div>

      {#if filteredClassifications.length === 0}
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">♫</div>
          <h3>{classificationSearch ? "No matching options" : "No options in this group yet"}</h3>
          <p>
            {classificationSearch
              ? "Try another name or slug, or clear the search field."
              : "Use the form above to add a classification to this group."}
          </p>
          {#if classificationSearch}
            <button class="secondary-button" type="button" onclick={() => (classificationSearch = "")}>
              Clear search
            </button>
          {/if}
        </div>
      {:else}
        <div class="table-scroll">
          <table>
            <colgroup>
              <col class="type-column" />
              <col class="name-column" />
              <col class="slug-column" />
              <col class="management-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Classification name</th>
                <th scope="col">Slug</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredClassifications as classification (classification.id)}
                <tr>
                  <td>
                    <span
                      class="type-badge"
                      class:language={classification.type === "LANGUAGE"}
                      class:genre={classification.type === "GENRE"}
                      class:mood={classification.type === "MOOD"}
                      class:category={classification.type === "CATEGORY"}
                    >
                      {typeLabel(classification.type)}
                    </span>
                  </td>

                  <td class="name-cell">
                    {#if editingId === classification.id}
                      <input
                        class="edit-input"
                        type="text"
                        bind:value={editingName}
                        maxlength="191"
                        aria-label={`New name for ${classification.name}`}
                        disabled={busyId !== null}
                        onkeydown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveEdit(classification);
                          } else if (event.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                      />
                    {:else}
                      <strong class="classification-name">{classification.name}</strong>
                    {/if}
                  </td>

                  <td>
                    <code class="slug">{classification.slug}</code>
                  </td>

                  <td class="actions-cell">
                    {#if classification.type === "LANGUAGE"}
                      <span class="fixed-label"><span aria-hidden="true">🔒</span> Fixed</span>
                    {:else if editingId === classification.id}
                      <div class="row-actions">
                        <button
                          class="small-button save-button"
                          type="button"
                          onclick={() => saveEdit(classification)}
                          disabled={busyId !== null || isCreating}
                        >
                          {busyId === classification.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          class="small-button"
                          type="button"
                          onclick={cancelEdit}
                          disabled={busyId !== null}
                        >
                          Cancel
                        </button>
                      </div>
                    {:else}
                      <div class="row-actions">
                        <button
                          class="small-button rename-button"
                          type="button"
                          onclick={() => beginEdit(classification)}
                          disabled={busyId !== null || isCreating}
                        >
                          Rename
                        </button>
                        <button
                          class="small-button delete-button"
                          type="button"
                          onclick={() => handleDelete(classification)}
                          disabled={busyId !== null || isCreating}
                        >
                          {busyId === classification.id ? "Working…" : "Delete"}
                        </button>
                      </div>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span>Showing <strong>{filteredClassifications.length}</strong> of <strong>{classifications.length}</strong> options</span>
          <span class="table-footer-note">Changes are saved to MySQL</span>
        </div>
      {/if}
    </section>

    <p class="page-note">
      Classification changes are saved through the protected administrator API. Options already assigned to songs cannot be deleted.
    </p>
  </main>
</div>

<style>
  .classifications-page {
    width: 100%;
    min-width: 0;
    color: #eef1f7;
  }

  .content {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 26px 32px 38px;
  }

  /* Breadcrumb */

  .breadcrumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 27px;
    color: #8994aa;
    font-size: 11px;
    line-height: 1.6;
  }

  .breadcrumb a {
    color: #b4bfd2;
    text-decoration: none;
    transition: color 120ms ease;
  }

  .breadcrumb a:hover {
    color: #f0d29b;
  }

  .breadcrumb [aria-current="page"] {
    color: #d9b87b;
  }

  /* Page introduction */

  .page-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }

  .intro-copy {
    min-width: 0;
  }

  .eyebrow {
    margin: 0 0 8px;
    color: #d9b87b;
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.15em;
    line-height: 1.5;
  }

  .subtitle {
    max-width: 760px;
    margin: 0;
    color: #b3bed1;
    font-size: 13px;
    font-weight: 450;
    line-height: 1.8;
    letter-spacing: 0.005em;
  }

  .count-card {
    display: grid;
    min-width: 126px;
    flex-shrink: 0;
    gap: 4px;
    padding: 13px 16px;
    border: 1px solid #343e52;
    border-radius: 11px;
    background: linear-gradient(145deg, #151f30, #111827);
  }

  .count-card span {
    color: #aab4c6;
    font-size: 10px;
    font-weight: 550;
  }

  .count-card strong {
    color: #f5f6fa;
    font-size: 27px;
    font-weight: 750;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
  }

  .count-card small {
    color: #7f8ba2;
    font-size: 9px;
    line-height: 1.4;
  }

  /* Feedback messages */

  .message {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 16px;
    padding: 12px 14px;
    border: 1px solid;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .message-icon {
    display: grid;
    width: 21px;
    height: 21px;
    flex: 0 0 21px;
    place-items: center;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 800;
  }

  .error-message {
    border-color: #713b43;
    background: #261b29;
    color: #ffb5ba;
  }

  .error-message .message-icon {
    background: #4b2632;
    color: #ffb5ba;
  }

  .success-message {
    border-color: #305a4b;
    background: #172b29;
    color: #a5dfc2;
  }

  .success-message .message-icon {
    background: #23453a;
    color: #a5dfc2;
  }

  .message-dismiss {
    display: grid;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    place-items: center;
    margin: -3px -4px 0 auto;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: currentColor;
    font: inherit;
    font-size: 19px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.8;
  }

  .message-dismiss:hover {
    border-color: currentColor;
    opacity: 1;
  }

  /* Panels */

  .management-panel {
    min-width: 0;
    margin-bottom: 20px;
    overflow: hidden;
    border: 1px solid #2c3549;
    border-radius: 13px;
    background: #111827;
    box-shadow: 0 7px 22px rgb(0 0 0 / 8%);
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 19px 22px;
    border-bottom: 1px solid #293144;
    background: linear-gradient(105deg, #131c2c, #111827 70%);
  }

  .panel-title-group {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
  }

  .panel-icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    place-items: center;
    border: 1px solid #62523a;
    border-radius: 9px;
    background: #29261f;
    color: #e6c487;
    font-size: 21px;
    font-weight: 500;
  }

  .panel-heading h2 {
    margin: 0 0 5px;
    color: #f0f2f8;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.4;
  }

  .panel-heading p {
    margin: 0;
    color: #a0abc0;
    font-size: 11px;
    font-weight: 450;
    line-height: 1.75;
  }

  .section-kicker {
    flex-shrink: 0;
    padding: 5px 8px;
    border: 1px solid #394258;
    border-radius: 6px;
    color: #929cb1;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  /* Add classification form */

  .create-form {
    display: grid;
    grid-template-columns: minmax(155px, 0.9fr) minmax(220px, 2.2fr) auto;
    align-items: end;
    gap: 15px;
    padding: 20px 22px 23px;
  }

  .create-form label {
    display: grid;
    min-width: 0;
    gap: 8px;
    color: #c1cada;
    font-size: 11px;
    font-weight: 600;
  }

  .create-form input,
  .options-search input,
  .edit-input {
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 41px;
    padding: 10px 12px;
    border: 1px solid #3a455c;
    border-radius: 7px;
    outline: none;
    background: #0c1423;
    color: #eef1f7;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.45;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }

  /* Classification Type: centred selected value and fixed gold arrow. */

  .create-form select {
    position: relative;
    display: flex;
    width: 100%;
    height: 48px;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    padding: 8px 36px;
    border: 1px solid #3a455c;
    border-radius: 7px;
    outline: none;
    background: #0c1423;
    color: #f0d29b;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
    text-align-last: center;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .create-form input::placeholder,
  .options-search input::placeholder {
    color: #77839a;
    font-weight: 400;
  }

  .create-form input:focus,
  .create-form select:focus,
  .options-search input:focus,
  .edit-input:focus {
    border-color: #d9b87b;
    outline: none;
    box-shadow: 0 0 0 3px rgb(217 184 123 / 12%);
  }

  /* Custom navy-and-gold Classification Type popup in modern Chrome. */

  @supports (appearance: base-select) {
    .create-form select,
    .create-form select::picker(select) {
      appearance: base-select;
    }

    .create-form select::picker(select) {
      padding: 5px;
      border: 1px solid #62533a;
      border-radius: 9px;
      background: #111827;
      box-shadow: 0 12px 28px rgb(0 0 0 / 40%);
    }

    .create-form select option {
      padding: 9px 11px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: #111827;
      color: #d6dceb;
      cursor: pointer;
    }

    .create-form select option:hover {
      border-color: #5e5038;
      background: #252b3c;
      color: #f0d29b;
    }

    .create-form select option:checked {
      border-color: #68533a;
      background: #30271e;
      color: #f0d29b;
      font-weight: 600;
    }

    .create-form select::picker-icon {
      position: absolute;
      right: 12px;
      margin: 0;
      color: #d9b87b;
      transition: rotate 280ms ease-in-out;
    }

    .create-form select:open::picker-icon {
      rotate: 180deg;
    }
  }

  /* Form buttons */

  .primary-button,
  .secondary-button {
    display: inline-flex;
    min-height: 41px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 10px 16px;
    border: 1px solid transparent;
    border-radius: 7px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  .primary-button {
    border-color: #d9b87b;
    background: #d9b87b;
    color: #171b27;
  }

  .primary-button:hover:not(:disabled) {
    border-color: #f0d29b;
    background: #f0d29b;
    transform: translateY(-1px);
  }

  .secondary-button {
    border-color: #40495c;
    background: #151e2e;
    color: #d6dceb;
  }

  .secondary-button:hover:not(:disabled) {
    border-color: #d9b87b;
    color: #f0d29b;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  /* Available options */

  .options-heading {
    padding-bottom: 17px;
  }

  .heading-title-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 4px;
  }

  .heading-title-line h2 {
    margin: 0;
  }

  .record-count {
    display: inline-flex;
    align-items: center;
    min-height: 23px;
    padding: 4px 8px;
    border: 1px solid #354057;
    border-radius: 20px;
    background: #20283a;
    color: #d2d9e7;
    font-size: 10px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  /* Filter tabs and search */

  .options-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 13px 18px;
    border-bottom: 1px solid #293144;
    background: #0f1726;
  }

  .filter-bar {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 7px;
  }

  .filter-button {
    display: inline-flex;
    min-height: 33px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 6px 9px;
    border: 1px solid #394258;
    border-radius: 7px;
    background: #111827;
    color: #c5cede;
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.3;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .filter-button:hover {
    border-color: #8b7754;
    color: #f0d29b;
  }

  .filter-button.active {
    border-color: #b99a60;
    background: #2b271f;
    color: #f2d39a;
    box-shadow: inset 0 0 0 1px rgb(217 184 123 / 7%);
  }

  .filter-count {
    display: inline-grid;
    min-width: 19px;
    height: 19px;
    place-items: center;
    padding: 0 4px;
    border-radius: 5px;
    background: rgb(255 255 255 / 5%);
    color: #9da9bf;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }

  .filter-button.active .filter-count {
    background: rgb(217 184 123 / 13%);
    color: #f2d39a;
  }

  .options-search {
    position: relative;
    display: flex;
    width: min(270px, 100%);
    min-width: 190px;
    flex: 0 1 270px;
    align-items: center;
  }

  .options-search input {
    min-height: 36px;
    padding: 8px 34px;
    font-size: 11px;
  }

  .search-icon {
    position: absolute;
    left: 11px;
    z-index: 1;
    color: #929cb1;
    font-size: 21px;
    line-height: 1;
    pointer-events: none;
  }

  .search-clear {
    position: absolute;
    right: 7px;
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #929cb1;
    font: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .search-clear:hover {
    background: #252d3e;
    color: #f0d29b;
  }

  /* Classification table */

  .table-scroll {
    width: 100%;
    overflow-x: auto;
    scrollbar-color: #46516a #111827;
    scrollbar-width: thin;
  }

  table {
    width: 100%;
    min-width: 680px;
    table-layout: fixed;
    border-collapse: collapse;
    text-align: left;
  }

  .type-column { width: 17%; }
  .name-column { width: 28%; }
  .slug-column { width: 29%; }
  .management-column { width: 26%; }

  th {
    padding: 12px 17px;
    border-bottom: 1px solid #2b3549;
    background: #151e2e;
    color: #aab5c9;
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.035em;
    line-height: 1.5;
  }

  td {
    padding: 12px 17px;
    border-bottom: 1px solid #252e40;
    color: #d6dceb;
    font-size: 12px;
    font-weight: 450;
    line-height: 1.55;
    vertical-align: middle;
    overflow-wrap: anywhere;
  }

  tbody tr {
    transition: background 110ms ease;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: #172133;
  }

  .name-cell {
    overflow-wrap: anywhere;
  }

  .classification-name {
    color: #f2f4f9;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.6;
    letter-spacing: 0.005em;
  }

  .slug {
    color: #b7c3d8;
    font-family: "Cascadia Code", Consolas, "SFMono-Regular", monospace;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.65;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  /* Type badges */

  .type-badge,
  .fixed-label {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 4px 8px;
    border: 1px solid #394258;
    border-radius: 6px;
    background: #20283a;
    color: #d3dbea;
    font-size: 10px;
    font-weight: 650;
    line-height: 1.3;
    white-space: nowrap;
  }

  .type-badge.language {
    border-color: #4d526c;
    background: #272a40;
    color: #cbd0fa;
  }

  .type-badge.genre {
    border-color: #68533a;
    background: #30271e;
    color: #f0c98b;
  }

  .type-badge.mood {
    border-color: #38594e;
    background: #1d332e;
    color: #a5dfc2;
  }

  .type-badge.category {
    border-color: #4a5263;
    background: #252c3a;
    color: #d0d8e7;
  }

  .fixed-label {
    border-color: #414967;
    background: #22283b;
    color: #bdc5e8;
  }

  .fixed-label span {
    font-size: 9px;
  }

  /* Inline editing and row actions */

  .edit-input {
    min-height: 36px;
    padding: 7px 9px;
  }

  .actions-cell {
    white-space: normal;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
  }

  .small-button {
    display: inline-flex;
    width: 76px;
    min-width: 76px;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    border: 1px solid #414b60;
    border-radius: 6px;
    background: #121b2b;
    color: #dce2ee;
    font-family: inherit;
    font-size: 10px;
    font-weight: 650;
    line-height: 1.2;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      color 120ms ease;
  }

  .small-button:hover:not(:disabled) {
    border-color: #d9b87b;
    background: #27271f;
    color: #f0d29b;
  }

  .save-button {
    border-color: #416b59;
    background: #1a302b;
    color: #a5dfc2;
  }

  .save-button:hover:not(:disabled) {
    border-color: #69a78b;
    background: #203d34;
    color: #c4f0d9;
  }

  .delete-button {
    border-color: #5e3943;
    background: #251b27;
    color: #eab0b4;
  }

  .delete-button:hover:not(:disabled) {
    border-color: #a6545d;
    background: #3a202b;
    color: #ffc1c4;
  }

  /* Table footer */

  .table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 18px;
    border-top: 1px solid #293144;
    background: #0f1726;
    color: #929cb1;
    font-size: 10px;
    line-height: 1.6;
  }

  .table-footer strong {
    color: #e4e9f2;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .table-footer-note {
    color: #7f8ba2;
  }

  /* Empty state */

  .empty-state {
    display: flex;
    max-width: 460px;
    min-height: 250px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    padding: 34px 24px;
    text-align: center;
  }

  .empty-icon {
    display: grid;
    width: 48px;
    height: 48px;
    margin: 0 auto 15px;
    place-items: center;
    border: 1px solid #4d4534;
    border-radius: 14px;
    background: #25241f;
    color: #d9b87b;
    font-size: 24px;
  }

  .empty-state h3 {
    margin: 0 0 8px;
    color: #eef1f7;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.55;
  }

  .empty-state p {
    margin: 0 0 16px;
    color: #a2aec2;
    font-size: 11px;
    line-height: 1.8;
  }

  /* Page note */

  .page-note {
    margin: 15px 0 0;
    color: #8995aa;
    font-size: 10px;
    font-weight: 450;
    line-height: 1.8;
  }

  /* Keyboard focus */

  button:focus-visible,
  a:focus-visible {
    outline: 2px solid #d9b87b;
    outline-offset: 3px;
  }

  /* Responsive adjustments */

  @media (max-width: 1000px) {
    .content {
      padding-right: 22px;
      padding-left: 22px;
    }

    .options-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .options-search {
      width: 100%;
      max-width: none;
      flex-basis: auto;
    }
  }

  @media (max-width: 760px) {
    .content {
      padding: 22px 16px 30px;
    }

    .breadcrumb {
      margin-bottom: 21px;
    }

    .page-intro {
      align-items: flex-start;
      gap: 15px;
      margin-bottom: 20px;
    }

    .subtitle {
      font-size: 12px;
    }

    .count-card {
      min-width: 94px;
      padding: 11px 12px;
    }

    .count-card strong {
      font-size: 23px;
    }

    .create-form {
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      padding: 18px;
    }

    .create-form .primary-button {
      justify-self: start;
    }

    .panel-heading {
      padding: 17px 18px;
    }

    .section-kicker {
      display: none;
    }

    .filter-bar {
      gap: 6px;
    }

    .filter-button {
      flex: 0 0 auto;
    }

    .table-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }
  }

  @media (max-width: 480px) {
    .content {
      padding: 19px 12px 26px;
    }

    .page-intro {
      flex-direction: column;
    }

    .count-card {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .count-card strong {
      margin-left: auto;
    }

    .count-card small {
      text-align: right;
    }

    .panel-heading {
      padding: 16px;
    }

    .options-toolbar {
      padding: 12px;
    }

    .filter-button {
      min-height: 32px;
      padding: 6px 8px;
      font-size: 10px;
    }

    .filter-count {
      min-width: 17px;
      height: 17px;
      font-size: 9px;
    }

    th,
    td {
      padding: 11px 12px;
    }

    .row-actions {
      gap: 6px;
    }

    .small-button {
      width: 72px;
      min-width: 72px;
    }

    .message {
      padding: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>

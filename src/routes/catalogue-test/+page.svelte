<script>
    import { getContext, onMount } from "svelte";

    import {
        createPlayerController,
        PLAYER_CONTEXT_KEY
    } from "#lib/player/player-controller.svelte.js";

    /** @type {ReturnType<typeof createPlayerController>} */
    const player = getContext(PLAYER_CONTEXT_KEY);

    /**
     * @typedef {Object} PublicSong
     * @property {number} id
     * @property {string} title
     * @property {string} artist
     * @property {string | null} album
     * @property {number | null} year
     * @property {number | null} durationSeconds
     * @property {boolean} hasCover
     * @property {string} audioUrl
     * @property {string | null} coverUrl
     * @property {Array<{
     *   id: number,
     *   type: string,
     *   name: string,
     *   slug: string
     * }>} classifications
     */

    /** @type {PublicSong[]} */
    let songs = $state([]);

    let isLoading = $state(true);
    let loadError = $state("");

    const currentTrackId = $derived(
        player.state.currentTrack?.id ?? null
    );

    let queueMessage = $state("");

    /**
     * Load songs from the public catalogue API.
     */
    async function loadSongs() {
        isLoading = true;
        loadError = "";

        try {
            const response = await fetch(
                "/api/public/songs?limit=50",
                {
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result?.error ?? "Unable to load published songs."
                );
            }

            songs = Array.isArray(result.songs)
                ? result.songs
                : [];

        } catch (error) {
            console.error("Public catalogue test page failed:", error);

            loadError =
                error instanceof Error
                    ? error.message
                    : "Unable to load published songs.";
        } finally {
            isLoading = false;
        }
    }

    /**
     * Convert public API data into the shared player's track format.
     *
     * @param {PublicSong} song
     * @returns {{
     *   id: number,
     *   title: string,
     *   artist: string,
     *   audioUrl: string,
     *   coverUrl: string | null
     * }}
     */
    function createPlayerTrack(song) {
        return {
            id: song.id,
            title: song.title,
            artist: song.artist,
            audioUrl: song.audioUrl,
            coverUrl: song.coverUrl
        };
    }

    /**
 * Play or pause an individual song.
 *
 * Only the selected song becomes the active collection.
 * Previously added manual queue items are retained.
 *
 * @param {PublicSong} song
 */
async function toggleSong(song) {
    const track = createPlayerTrack(song);

    await player.toggleTrack(track, [track]);
}

    /**
 * Manually add a song to the end of the playback queue.
 *
 * @param {PublicSong} song
 */
function addSongToQueue(song) {
    const added = player.addToQueue(
        createPlayerTrack(song)
    );

    queueMessage = added
        ? `"${song.title}" was added to the queue.`
        : `"${song.title}" is already in the queue or unavailable.`;
}

    /**
     * Format duration in minutes and seconds.
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
            return "—:—";
        }

        const minutes = Math.floor(seconds / 60);
        const remainder = String(
            Math.floor(seconds % 60)
        ).padStart(2, "0");

        return `${minutes}:${remainder}`;
    }

    onMount(() => {
        void loadSongs();
    });
</script>

<svelte:head>
    <title>Public Playback Test | Music Archive</title>
    <meta
        name="robots"
        content="noindex, nofollow"
    />
</svelte:head>

<main class="test-page">

    <header class="page-header">
        <div>
            <p class="eyebrow">MUSIC ARCHIVE</p>
            <h1>Public Playback Test</h1>
            <p class="page-description">
                Testing published songs through the public API
                and shared music player.
            </p>
        </div>

        <button
            class="refresh-button"
            type="button"
            onclick={loadSongs}
            disabled={isLoading}
        >
            {isLoading ? "Loading..." : "Refresh"}
        </button>
    </header>

    <section class="catalogue-section">

        <div class="section-heading">
            <div>
                <h2>Published Songs</h2>
                <p>
                    {songs.length}
                    {songs.length === 1 ? "song" : "songs"} available
                </p>
            </div>
        </div>

        <!-- TEMPORARY QUEUE TEST PANEL -->
        <section class="queue-test-panel">

            <div class="queue-test-header">
                <div>
                    <h3>Playback Queue Test</h3>
                    <p>
                        {player.state.queue.length}
                        {player.state.queue.length === 1 ? "track" : "tracks"} in queue
                    </p>
                </div>

                <div class="queue-test-controls">

                    <button
                        type="button"
                        onclick={() => player.playPrevious()}
                        disabled={player.state.queueIndex <= 0}
                    >
                        Previous
                    </button>

                    <button
                        type="button"
                        onclick={() => player.playNext()}
                        disabled={
                            player.state.queue.length === 0 ||
                            player.state.queueIndex >= player.state.queue.length - 1
                        }
                    >
                        Next
                    </button>
                    <button
                        type="button"
                        class="queue-clear-button"
                        onclick={() => player.clearQueue()}
                        disabled={player.state.queue.length === 0}
                    >
                        Clear Queue
                    </button>

                </div>
            </div>

            {#if queueMessage}
                <p class="queue-feedback" role="status">
                    {queueMessage}
                </p>
            {/if}

            {#if player.state.queue.length > 0}

                <ol class="queue-test-list">

                    {#each player.state.queue as track, index (track.id)}

                        <li
                            class:current-queue-track={
                                player.state.queueIndex === index
                            }
                        >
                            <div class="queue-track-information">
                                <span class="queue-track-number">
                                    {index + 1}.
                                </span>

                                <div>
                                    <strong>{track.title}</strong>
                                    <span>{track.artist}</span>
                                </div>
                            </div>

                            <div class="queue-item-actions">

    <button
        type="button"
        class="queue-play-button"
        onclick={() => player.playTrack(track)}
    >
        Play
    </button>

    <button
        type="button"
        class="queue-remove-button"
        onclick={() => player.removeTrack(track.id)}
    >
        Remove
    </button>

</div>

                        </li>

                    {/each}

                </ol>

            {:else}

                <p class="queue-empty-message">
                    The playback queue is currently empty.
                    Start playing a published song to create a collection queue.
                </p>

            {/if}

        </section>
        <!-- END TEMPORARY QUEUE TEST PANEL -->


        {#if isLoading}

            <div class="message">
                Loading published songs...
            </div>

        {:else if loadError}

            <div class="message error-message" role="alert">
                {loadError}
            </div>

        {:else if songs.length === 0}

            <div class="message">
                No published songs are currently available.
            </div>

        {:else}

            <div class="song-list">

                {#each songs as song (song.id)}

                    <article
                        class="song-card"
                        class:active={currentTrackId === song.id}
                    >

                        <div class="song-artwork">

                            {#if song.coverUrl}

                                <img
                                    src={song.coverUrl}
                                    alt={`Cover artwork for ${song.title}`}
                                    loading="lazy"
                                />

                            {:else}

                                <div class="artwork-placeholder">
                                    <span>♪</span>
                                </div>

                            {/if}

                        </div>

                        <div class="song-information">

                            <h3 title={song.title}>
                                {song.title}
                            </h3>

                            <p class="artist-name">
                                {song.artist}
                            </p>

                            <div class="song-metadata">

                                {#if song.year}
                                    <span>{song.year}</span>
                                {/if}

                                {#if song.durationSeconds !== null}
                                    <span>
                                        {formatDuration(song.durationSeconds)}
                                    </span>
                                {/if}

                            </div>

                            {#if song.classifications.length > 0}

                                <div class="classification-list">
                                    {#each song.classifications as classification}
                                        <span class="classification-tag">
                                            {classification.name}
                                        </span>
                                    {/each}
                                </div>

                            {/if}

                        </div>

                        <div class="song-actions">

    <button
        class="play-button"
        type="button"
        onclick={() => toggleSong(song)}
        aria-label={
            currentTrackId === song.id &&
            player.state.isPlaying
                ? `Pause ${song.title}`
                : `Play ${song.title}`
        }
        aria-pressed={
            currentTrackId === song.id &&
            player.state.isPlaying
        }
    >
        {#if currentTrackId === song.id && player.state.isPlaying}
            Pause
        {:else}
            Play
        {/if}
    </button>

    <button
        class="queue-button"
        type="button"
        onclick={() => addSongToQueue(song)}
    >
        + Queue
    </button>

</div>

                    </article>

                {/each}

            </div>

        {/if}

    </section>

</main>

<style>
    .test-page {
        width: 100%;
        max-width: 1100px;
        min-height: 75vh;
        margin: 0 auto;
        padding: 45px 28px 150px;
        color: #eef1f7;
    }

    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 38px;
    }

    .eyebrow {
        margin: 0 0 10px;
        color: #d9b87b;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 0.16em;
    }

    h1 {
        margin: 0;
        color: #f2f4f9;
        font-size: clamp(25px, 4vw, 34px);
        font-weight: 750;
    }

    .page-description {
        margin: 9px 0 0;
        color: #aebacd;
        font-size: 14px;
        line-height: 1.6;
    }

    .refresh-button {
        flex-shrink: 0;
        padding: 10px 17px;
        border: 1px solid #536078;
        border-radius: 7px;
        background: #1a2638;
        color: #eef1f7;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
            border-color 150ms ease,
            background 150ms ease;
    }

    .refresh-button:hover:not(:disabled) {
        border-color: #d9b87b;
        background: #263449;
    }

    .refresh-button:disabled {
        cursor: wait;
        opacity: 0.6;
    }

    .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 17px;
    }

    .section-heading h2 {
        margin: 0;
        color: #f2f4f9;
        font-size: 19px;
        font-weight: 700;
    }

    .section-heading p {
        margin: 5px 0 0;
        color: #96a4b8;
        font-size: 12px;
    }

    .song-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .song-card {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 14px;
        padding: 13px;
        border: 1px solid #303b50;
        border-radius: 10px;
        background: #141f30;
        transition:
            border-color 150ms ease,
            background 150ms ease;
    }

    .song-card.active {
        border-color: #b99b67;
        background: #1a293b;
    }

    .song-artwork {
        width: 66px;
        height: 66px;
        flex-shrink: 0;
        overflow: hidden;
        border: 1px solid #39465c;
        border-radius: 7px;
        background: #263449;
    }

    .song-artwork img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .artwork-placeholder {
        display: grid;
        width: 100%;
        height: 100%;
        place-items: center;
        color: #d9b87b;
        font-size: 29px;
    }

    .song-information {
        flex: 1;
        min-width: 0;
    }

    .song-information h3 {
        overflow: hidden;
        margin: 0;
        color: #f2f4f9;
        font-size: 14px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .artist-name {
        overflow: hidden;
        margin: 5px 0 0;
        color: #b7c2d2;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .song-metadata {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 7px;
        color: #8493a9;
        font-size: 10px;
    }

    .classification-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 8px;
    }

    .classification-tag {
        padding: 3px 7px;
        border: 1px solid #39465c;
        border-radius: 20px;
        color: #c5cfdd;
        font-size: 9px;
    }

    .play-button {
        flex-shrink: 0;
        min-width: 65px;
        padding: 9px 12px;
        border: 1px solid #d9b87b;
        border-radius: 6px;
        background: #d9b87b;
        color: #151a28;
        font-size: 12px;
        font-weight: 750;
        cursor: pointer;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    .play-button:hover {
        border-color: #f0d29b;
        background: #f0d29b;
    }


    /* =========================================================
   TEMPORARY QUEUE TEST PANEL
========================================================= */

.queue-test-panel {
    margin-bottom: 25px;
    padding: 18px;
    border: 1px solid #39465c;
    border-radius: 10px;
    background: #101b2a;
}

.queue-test-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 14px;
}

.queue-test-header h3 {
    margin: 0;
    color: #f2f4f9;
    font-size: 14px;
    font-weight: 700;
}

.queue-test-header p {
    margin: 5px 0 0;
    color: #96a4b8;
    font-size: 11px;
}

.queue-test-controls {
    display: flex;
    gap: 7px;
}

.queue-test-controls button,
.queue-play-button {
    padding: 7px 11px;
    border: 1px solid #536078;
    border-radius: 5px;
    background: #1a2638;
    color: #eef1f7;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.queue-test-controls button:hover:not(:disabled),
.queue-play-button:hover {
    border-color: #d9b87b;
    color: #d9b87b;
}

.queue-test-controls button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
}

.queue-feedback {
    margin: 0 0 12px;
    color: #d9b87b;
    font-size: 11px;
}

.queue-test-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.queue-test-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px;
    border: 1px solid #303b50;
    border-radius: 6px;
    background: #141f30;
}

.queue-test-list li.current-queue-track {
    border-color: #b99b67;
    background: #1a293b;
}

.queue-track-information {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.queue-track-number {
    flex-shrink: 0;
    color: #d9b87b;
    font-size: 12px;
}

.queue-track-information div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 3px;
}

.queue-track-information strong {
    overflow: hidden;
    color: #eef1f7;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.queue-track-information span:not(.queue-track-number) {
    overflow: hidden;
    color: #96a4b8;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.queue-empty-message {
    margin: 0;
    color: #96a4b8;
    font-size: 12px;
    line-height: 1.6;
}

.queue-item-actions {
    display: flex;
    flex-shrink: 0;
    gap: 6px;
}

.queue-clear-button,
.queue-remove-button {
    padding: 7px 10px;
    border: 1px solid #74444c;
    border-radius: 5px;
    background: #30202a;
    color: #ffabb2;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.queue-clear-button:hover:not(:disabled),
.queue-remove-button:hover {
    border-color: #ffabb2;
    background: #482631;
}

.queue-clear-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
}

/* =========================================================
   SONG CARD ACTIONS
========================================================= */

.song-actions {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 7px;
}

.queue-button {
    min-width: 65px;
    padding: 8px 10px;
    border: 1px solid #536078;
    border-radius: 6px;
    background: #1a2638;
    color: #d9b87b;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    transition:
        background 150ms ease,
        border-color 150ms ease;
}

.queue-button:hover {
    border-color: #d9b87b;
    background: #263449;
}

    .message {
        padding: 35px 20px;
        border: 1px solid #303b50;
        border-radius: 9px;
        background: #141f30;
        color: #aebacd;
        font-size: 14px;
        text-align: center;
    }

    .error-message {
        border-color: #74444c;
        color: #ffabb2;
    }

    @media (max-width: 760px) {
        .test-page {
            padding: 30px 17px 145px;
        }

        .song-list {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    @media (max-width: 480px) {
        .page-header {
            align-items: flex-start;
        }

        .refresh-button {
            padding: 9px 12px;
            font-size: 11px;
        }

        .song-card {
            gap: 10px;
            padding: 10px;
        }

        .song-artwork {
            width: 54px;
            height: 54px;
        }

        .play-button {
            min-width: 55px;
            padding: 8px;
        }

        .song-actions {
    gap: 5px;
}

.song-actions .play-button,
.song-actions .queue-button {
    min-width: 58px;
    padding: 7px 6px;
    font-size: 10px;
}
    }
</style>
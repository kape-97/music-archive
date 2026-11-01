
<script>
    import { getContext, onMount } from "svelte";
    import { page } from "$app/state";

    import {
        createPlayerController,
        PLAYER_CONTEXT_KEY
    } from "#lib/player/player-controller.svelte.js";

    /** @type {ReturnType<typeof createPlayerController>} */
    const player = getContext(PLAYER_CONTEXT_KEY);

    /** @type {HTMLAudioElement | undefined} */
    let audioElement;

    /** @type {number | null} */
    let seekPreview = $state(null);

    /** @type {string | null} */
    let failedCoverUrl = $state(null);

    const isAdminPage = $derived(
        page.url.pathname.startsWith("/admin")
    );

    const currentTrack = $derived(
        player.state.currentTrack
    );

    const progressTime = $derived(
        seekPreview ?? player.state.currentTime
    );

    const safeProgressTime = $derived(
        Math.max(
            0,
            Math.min(
                player.state.duration,
                progressTime
            )
        )
    );

    const progressPercent = $derived(
        player.state.duration > 0
            ? (safeProgressTime / player.state.duration) * 100
            : 0
    );

    const volumePercent = $derived(
        Math.round(player.state.volume * 100)
    );

    const coverUrl = $derived(
        currentTrack?.coverUrl ?? null
    );

    const showCover = $derived(
        Boolean(coverUrl) &&
        failedCoverUrl !== coverUrl
    );

    /**
     * 1st attach the audio element after the component mounts.
     * 2nd release it when the component is destroyed.
     */
    onMount(() => {
        if (!audioElement) return;

        player.attachAudioElement(audioElement);

        return () => {
            if (audioElement) {
                player.detachAudioElement(audioElement);
            }
        };
    });

    /**
     * Format playback time as minutes and seconds.
    
     * @param {number | null | undefined} seconds
     * @returns {string}
     */
    function formatTime(seconds) {
        if (
            seconds === null ||
            seconds === undefined ||
            !Number.isFinite(seconds) ||
            seconds < 0
        ) {
            return "—:—";
        }

        const total = Math.floor(seconds);
        const minutes = Math.floor(total / 60);
        const remainder = String(total % 60).padStart(2, "0");

        return `${minutes}:${remainder}`;
    }

    /**
     * Update the displayed seek position while dragging.
     *
     * @param {Event} event
     */
    function handleSeekInput(event) {
        const input = event.currentTarget;

        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        const value = Number(input.value);

        if (Number.isFinite(value) && value >= 0) {
            seekPreview = value;
        }
    }

    /**
     * Apply the selected seek position.
     *
     * @param {Event} event
     */
    function handleSeekChange(event) {
        const input = event.currentTarget;

        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        const value = Number(input.value);

        if (Number.isFinite(value)) {
            player.seekTo(value);
        }

        seekPreview = null;
    }

    /**
     * Update the player volume using the volume slider.
     *
     * @param {Event} event
     */
    function handleVolumeInput(event) {
        const input = event.currentTarget;

        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        const value = Number(input.value);

        if (Number.isFinite(value)) {
            player.setVolume(value);
        }
    }

    /**
     * Record a failed cover-art request.
     */
    function handleCoverError() {
        failedCoverUrl = coverUrl;
    }
</script>


{#if currentTrack}
    <div
        class="player-spacer"
        aria-hidden="true"
    ></div>
{/if}


<!-- one audio element control everything -->
<audio
    bind:this={audioElement}
    class="player-audio-engine"
    preload="none"
    aria-hidden="true"
    tabindex="-1"
    onplay={player.handlePlay}
    onpause={player.handlePause}
    onwaiting={player.handleWaiting}
    onplaying={player.handlePlaying}
    oncanplay={player.handleCanPlay}
    ontimeupdate={player.handleTimeUpdate}
    onloadedmetadata={player.handleMetadata}
    ondurationchange={player.handleMetadata}
    onended={player.handleEnded}
    onerror={player.handleError}
    onvolumechange={player.handleVolumeChange}
></audio>


{#if currentTrack}
    <section
        class="player-shell"
        class:admin={isAdminPage}
        aria-label="Persistent music player"
    >
        <div class="player-inner">

            <!-- left side current song information  -->
            <div class="track-details">

                {#if currentTrack.coverUrl && showCover}
                    <img
                        class="track-cover"
                        src={currentTrack.coverUrl}
                        alt={`Cover artwork for ${currentTrack.title}`}
                        onerror={handleCoverError}
                    />
                {:else}
                    <div
                        class="track-cover track-cover-placeholder"
                        aria-label="No cover artwork"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M9 18V5l12-2v13"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                            <circle
                                cx="6"
                                cy="18"
                                r="3"
                                fill="currentColor"
                            />
                            <circle
                                cx="18"
                                cy="16"
                                r="3"
                                fill="currentColor"
                            />
                        </svg>
                    </div>
                {/if}

<!--now playing text -->
                <div class="track-copy">
                    <p class="now-playing-label">
                        NOW PLAYING
                    </p>

                    <strong
                        class="track-title"
                        title={currentTrack.title}
                    >
                        {currentTrack.title}
                    </strong>

                    <span
                        class="track-artist"
                        title={currentTrack.artist}
                    >
                        {currentTrack.artist}
                    </span>
<!-- error message -->
                    {#if player.state.errorMessage}
                        <span
                            class="player-status player-error"
                            role="status"
                        >
                            {player.state.errorMessage}
                        </span>
                    {:else if player.state.isLoading} 
                        <span class="player-status">
                            Loading audio...
                        </span>
                    {/if}
                </div>

            </div>


            <!-- right side the playback area and controls -->
            <div class="playback-area">

                <!-- Timeline -->
                <div class="timeline">

                    <input
                        class="seek-slider"
                        type="range"
                        min="0"
                        max={player.state.duration}
                        step="0.1"
                        value={safeProgressTime}
                        disabled={player.state.duration <= 0}
                        aria-label="Seek through current song"
                        aria-valuetext={`${formatTime(safeProgressTime)} of ${formatTime(
                            player.state.duration > 0
                                ? player.state.duration
                                : null
                        )}`}
                        style={`--progress: ${progressPercent}%`}
                        oninput={handleSeekInput}
                        onchange={handleSeekChange}
                    />

                    <div class="timeline-labels">
                        <span>
                            {formatTime(player.state.currentTime)}
                        </span>

                        <span>
                            {formatTime(
                                player.state.duration > 0
                                    ? player.state.duration
                                    : null
                            )}
                        </span>
                    </div>

                </div>

                <!-- this will done for the public catalogue media player-->
                 
                <!-- Transport controls and volume -->
                <div class="controls-row">

                    <!-- Previous, Play/Pause and Next -->
                    <div class="transport-controls">

                        <!-- Previous: navigation will be connected later -->
                        <button
                            class="transport-button"
                            type="button"
                            disabled
                            aria-label="Previous song"
                            title="Previous song — coming next"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path d="M6 5h2v14H6zM19 6v12L9 12z" />
                            </svg>
                        </button>


                        <!-- play/pause control -->
                        <button
                            class="play-toggle"
                            type="button"
                            onclick={player.toggleCurrentTrack}
                            aria-label={player.state.isPlaying
                                ? `Pause ${currentTrack.title}`
                                : `Play ${currentTrack.title}`}
                            aria-pressed={player.state.isPlaying}
                            title={player.state.isPlaying ? "Pause" : "Play"}
                        >
                            {#if player.state.isPlaying}
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


                        <!-- Next: navigation will be connected later -->
                        <button
                            class="transport-button"
                            type="button"
                            disabled
                            aria-label="Next song"
                            title="Next song — coming next"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path d="M16 5h2v14h-2zM5 6v12l10-6z" />
                            </svg>
                        </button>

                    </div>


                    <!-- Volume controls -->
                    <div class="volume-area">

                        <!-- Mute / Unmute -->
                        <button
                            class="volume-toggle"
                            type="button"
                            onclick={player.toggleMute}
                            aria-label={player.state.isMuted
                                ? "Unmute volume"
                                : "Mute volume"}
                            aria-pressed={player.state.isMuted}
                            title={player.state.isMuted ? "Unmute" : "Mute"}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path d="M11 5 6 9H3v6h3l5 4V5Z" />

                                {#if player.state.isMuted}
                                    <path d="m16 9 5 6m0-6-5 6" />
                                {:else}
                                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                                    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                                {/if}
                            </svg>
                        </button>


                        <!-- Volume slider -->
                        <input
                            class="volume-slider"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={player.state.volume}
                            aria-label="Volume"
                            aria-valuetext={`${volumePercent}%`}
                            style={`--volume-level: ${volumePercent}%`}
                            oninput={handleVolumeInput}
                        />


                        <!-- Current volume percentage -->
                        <span class="volume-percent">
                            {volumePercent}%
                        </span>

                    </div>

                </div>

            </div>

        </div>
    </section>
{/if}


<style>
    .player-audio-engine {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
        border: 0;
    }


    .player-spacer {
        height: 100px;
        pointer-events: none;
    }


    .player-shell {
        position: fixed;
        z-index: 50;
        right: 0;
        bottom: 0;
        left: 0;
        width: auto;
        border-top: 1px solid #303b50;
        background: #101827;
        box-shadow: 0 -8px 30px rgb(0 0 0 / 25%);
        color: #eef1f7;
    }


    .player-shell.admin {
        left: 244px;
    }


    /* Two horizontal sections: song information and playback. */

    .player-inner {
        display: grid;
        width: 100%;
        max-width: 1500px;
        min-height: 96px;
        grid-template-columns: minmax(220px, 250px) minmax(0, 1fr);
        align-items: center;
        gap: 24px;
        margin: 0 auto;
        padding: 11px 28px;
    }


    /* Track information */

    .track-details {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 13px;
    }


    .track-cover {
        display: block;
        width: 54px;
        height: 54px;
        flex-shrink: 0;
        border: 1px solid #39465c;
        border-radius: 7px;
        background: #263449;
        object-fit: cover;
    }


    .track-cover-placeholder {
        display: grid;
        place-items: center;
        padding: 13px;
        color: #d9b87b;
    }


    .track-cover-placeholder svg {
        width: 100%;
        height: 100%;
    }


    .track-copy {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
    }


    .now-playing-label {
        margin: 0;
        color: #d9b87b;
        font-size: 9px;
        font-weight: 750;
        letter-spacing: 0.14em;
    }


    .track-title {
        overflow: hidden;
        color: #f2f4f9;
        font-size: 15px;
        font-weight: 750;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
    }


    .track-artist {
        overflow: hidden;
        color: #b7c2d2;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
    }


    .player-status {
        color: #d9b87b;
        font-size: 9px;
        line-height: 1.4;
    }


    .player-error {
        color: #ff9da5;
    }


    /* Playback area: timeline on top, controls underneath. */

    .playback-area {
        display: flex;
        width: 100%;
        max-width: 760px;
        min-width: 0;
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        justify-self: center;
        gap: 10px;
    }


    .timeline {
        display: flex;
        width: 100%;
        min-width: 0;
        flex-direction: column;
        gap: 6px;
    }


    /* Song seek slider */

    .seek-slider {
        display: block;
        width: 100%;
        height: 5px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 10px;
        outline: none;
        background: linear-gradient(
            to right,
            #d9b87b 0%,
            #d9b87b var(--progress),
            #39465c var(--progress),
            #39465c 100%
        );
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }


    .seek-slider::-webkit-slider-thumb {
        width: 11px;
        height: 11px;
        border: 2px solid #f0d29b;
        border-radius: 50%;
        background: #d9b87b;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }


    .seek-slider::-moz-range-thumb {
        width: 9px;
        height: 9px;
        border: 2px solid #f0d29b;
        border-radius: 50%;
        background: #d9b87b;
        cursor: pointer;
    }


    .seek-slider:focus-visible {
        outline: 1px solid #f0d29b;
        outline-offset: 5px;
    }


    .seek-slider:disabled {
        cursor: default;
        opacity: 0.5;
    }


    .timeline-labels {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        color: #f7f8f8;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }


    /* Transport controls and volume controls share one row. */

    .controls-row {
        position: relative;
        display: flex;
        width: 100%;
        min-height: 40px;
        align-items: center;
        justify-content: center;
    }


    /* Centred Previous, Play/Pause and Next buttons. */

    .transport-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 25px;
    }


    .transport-button {
        display: grid;
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: #c4cedc;
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease;
    }


    .transport-button svg {
        display: block;
        width: 21px;
        height: 21px;
        fill: currentColor;
    }


    .transport-button:disabled {
        cursor: not-allowed;
        opacity: 0.35;
    }


    .transport-button:focus-visible {
        outline: 2px solid #d9b87b;
        outline-offset: 3px;
    }


    /* Play/Pause button */

    .play-toggle {
        display: grid;
        width: 40px;
        height: 40px;
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


    .play-toggle:hover {
        border-color: #f0d29b;
        background: #f0d29b;
        transform: translateY(-1px);
    }


    .play-toggle:focus-visible {
        outline: 2px solid #f0d29b;
        outline-offset: 3px;
    }


    .play-toggle svg {
        display: block;
        width: 19px;
        height: 19px;
        fill: currentColor;
    }


    .play-toggle[aria-label^="Play"] svg {
        margin-left: 2px;
    }


    /* Volume controls: positioned at the right of the transport row. */

    .volume-area {
        position: absolute;
        top: 50%;
        right: 0;
        display: flex;
        width: 170px;
        min-width: 0;
        align-items: center;
        gap: 8px;
        transform: translateY(-50%);
    }


    .volume-toggle {
        display: grid;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: #c4cedc;
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease;
    }


    .volume-toggle:hover {
        background: #263449;
        color: #f0d29b;
    }


    .volume-toggle:focus-visible {
        outline: 2px solid #d9b87b;
        outline-offset: 3px;
    }


    .volume-toggle svg {
        display: block;
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
    }


    /* Volume slider */

    .volume-slider {
        display: block;
        width: 100%;
        min-width: 0;
        height: 4px;
        flex: 1;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 10px;
        outline: none;
        background: linear-gradient(
            to right,
            #d9b87b 0%,
            #d9b87b var(--volume-level),
            #39465c var(--volume-level),
            #39465c 100%
        );
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }


    .volume-slider::-webkit-slider-thumb {
        width: 11px;
        height: 11px;
        border: 2px solid #f0d29b;
        border-radius: 50%;
        background: #d9b87b;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }


    .volume-slider::-moz-range-thumb {
        width: 9px;
        height: 9px;
        border: 2px solid #f0d29b;
        border-radius: 50%;
        background: #d9b87b;
        cursor: pointer;
    }


    .volume-slider:focus-visible {
        outline: 1px solid #f0d29b;
        outline-offset: 5px;
    }


    .volume-percent {
        width: 32px;
        flex-shrink: 0;
        color: #b7c2d2;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        text-align: right;
    }


    /* Responsive layout */

    @media (max-width: 1100px) {
        .player-inner {
            grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
            gap: 18px;
            padding-right: 18px;
            padding-left: 18px;
        }
    }


    /* Tablet and mobile layout */

    @media (max-width: 900px) {
        .controls-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            align-items: center;
            gap: 6px;
        }

        .transport-controls {
            grid-column: 2;
            grid-row: 1;
            gap: 16px;
        }

        .volume-area {
            position: static;
            grid-column: 3;
            grid-row: 1;
            justify-self: end;
            width: 100%;
            max-width: 110px;
            gap: 5px;
            transform: none;
        }

        .volume-percent {
            display: none;
        }

        .volume-toggle {
            width: 26px;
            height: 26px;
        }

        .volume-slider {
            min-width: 0;
        }
    }


    @media (max-width: 760px) {
        .player-shell.admin {
            left: 68px;
        }

        .player-inner {
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
            padding: 9px 14px 11px;
        }

        .track-cover {
            width: 42px;
            height: 42px;
        }

        .track-cover-placeholder {
            padding: 10px;
        }

        .track-title {
            font-size: 14px;
        }

        .track-artist {
            font-size: 12px;
        }

        .playback-area {
            gap: 7px;
        }

        .player-spacer {
            height: 145px;
        }
    }


    @media (max-width: 420px) {
        .player-shell.admin {
            left: 56px;
        }

        .player-inner {
            padding-right: 10px;
            padding-left: 10px;
        }

        .track-details {
            gap: 9px;
        }

        .transport-controls {
            gap: 12px;
        }

        .volume-area {
            gap: 4px;
        }

        .volume-toggle {
            width: 24px;
            height: 24px;
        }
    }
</style>

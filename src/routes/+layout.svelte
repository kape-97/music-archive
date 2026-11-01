
<script>
    import { setContext } from "svelte";

    import favicon from "#lib/assets/favicon.svg";

    import PersistentPlayer from "#lib/components/player/PersistentPlayer.svelte";

    import {
        createPlayerController,
        PLAYER_CONTEXT_KEY
    } from "#lib/player/player-controller.svelte.js";

    /** @type {{children: import('svelte').Snippet}} */
    let { children } = $props();

    // Create one playback controller for this application component tree.
    const playerController = createPlayerController();

    // Share the controller with all nested components.
    setContext(PLAYER_CONTEXT_KEY, playerController);
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Mount the persistent player globally. -->
<PersistentPlayer />

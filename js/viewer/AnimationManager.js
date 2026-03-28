/**
 * AnimationManager.js — Animation playback for models with embedded animations
 */
import * as THREE from '../lib/three.module.min.js';

export class AnimationManager {
    constructor() {
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.currentAction = null;
        this.actions = [];
        this.clipNames = [];
        this.isPlaying = false;
        this.speed = 1.0;
        this.duration = 0;
        this.currentTime = 0;
    }

    /**
     * Setup animation mixer for a loaded model
     */
    setup(model, animations) {
        this.dispose();

        if (!animations || animations.length === 0) return false;

        this.mixer = new THREE.AnimationMixer(model);
        this.clipNames = [];
        this.actions = [];

        for (const clip of animations) {
            const action = this.mixer.clipAction(clip);
            this.actions.push(action);
            this.clipNames.push(clip.name || `Clip ${this.clipNames.length}`);
        }

        // Play first clip by default
        if (this.actions.length > 0) {
            this.currentAction = this.actions[0];
            this.duration = this.currentAction.getClip().duration;
        }

        return true;
    }

    play(clipIndex = -1) {
        if (!this.mixer) return;

        if (clipIndex >= 0 && clipIndex < this.actions.length) {
            if (this.currentAction) this.currentAction.stop();
            this.currentAction = this.actions[clipIndex];
            this.duration = this.currentAction.getClip().duration;
        }

        if (this.currentAction) {
            this.currentAction.play();
            this.isPlaying = true;
            this.clock.start();
        }
    }

    pause() {
        if (this.currentAction) {
            this.currentAction.paused = !this.currentAction.paused;
            this.isPlaying = !this.currentAction.paused;
        }
    }

    stop() {
        if (this.currentAction) {
            this.currentAction.stop();
            this.isPlaying = false;
        }
    }

    setSpeed(speed) {
        this.speed = speed;
        if (this.mixer) {
            this.mixer.timeScale = speed;
        }
    }

    setTime(time) {
        if (this.currentAction) {
            this.currentAction.time = time;
            this.currentTime = time;
            if (!this.isPlaying) {
                this.mixer.update(0); // Force update without advancing time
            }
        }
    }

    /**
     * Call each frame to advance animation
     */
    update() {
        if (this.mixer && this.isPlaying) {
            const delta = this.clock.getDelta();
            this.mixer.update(delta);
            if (this.currentAction) {
                this.currentTime = this.currentAction.time;
            }
        }
    }

    hasAnimations() {
        return this.actions.length > 0;
    }

    getClipNames() {
        return this.clipNames;
    }

    dispose() {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer.uncacheRoot(this.mixer.getRoot());
        }
        this.mixer = null;
        this.currentAction = null;
        this.actions = [];
        this.clipNames = [];
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
    }
}

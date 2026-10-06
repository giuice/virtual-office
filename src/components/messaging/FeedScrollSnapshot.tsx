'use client';

import { Component } from 'react';

interface FeedScrollSnapshotProps {
  /** The feed's rendered messages; a new array means the feed is about to change. */
  messages: ReadonlyArray<{ id: string }>;
  /** Reads the reader's position from the DOM before React applies the change. */
  onBeforeCommit: () => void;
}

/**
 * Lets the feed read the reader's scroll position right before React applies
 * a message change to the DOM. Layout effects run after the DOM has changed,
 * and the scroll event that normally keeps the position current fires only at
 * the next rendering step; `getSnapshotBeforeUpdate` is the one React phase
 * that sees the DOM as the reader left it, and it has no hook equivalent.
 * Renders nothing.
 */
export class FeedScrollSnapshot extends Component<FeedScrollSnapshotProps> {
  getSnapshotBeforeUpdate(previousProps: Readonly<FeedScrollSnapshotProps>): null {
    if (previousProps.messages !== this.props.messages) {
      this.props.onBeforeCommit();
    }
    return null;
  }

  // React requires componentDidUpdate alongside getSnapshotBeforeUpdate; the
  // snapshot is consumed by the feed's layout effect instead.
  componentDidUpdate(): void {}

  render(): null {
    return null;
  }
}

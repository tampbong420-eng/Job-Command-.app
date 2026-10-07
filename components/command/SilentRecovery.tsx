"use client";

import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { reportClientError, shouldAutoReset } from "@/lib/diagnostics";
import { useSilentRecovery } from "@/hooks/use-silent-recovery";

type Props = { children: ReactNode };

type State = { nonce: number };

export class SilentBoundary extends Component<Props, State> {
  state: State = { nonce: 0 };

  static getDerivedStateFromError() {
    return {};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, info.componentStack?.slice(0, 80));
    if (shouldAutoReset(error.message)) {
      this.setState((current) => ({ nonce: current.nonce + 1 }));
    }
  }

  render() {
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>;
  }
}

function WindowRecovery() {
  useSilentRecovery();
  return null;
}

export function SilentRecovery({ children }: Props) {
  return (
    <SilentBoundary>
      <WindowRecovery />
      {children}
    </SilentBoundary>
  );
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { AlertTriangle, RefreshCw, Copy, ChevronDown, ChevronUp } from 'lucide-react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Global Error Boundary for the app
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them to Sentry, and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to Sentry
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Also log to console for development
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });
  }

  handleRestart = async () => {
    // On native, try to reload the app
    if (Platform.OS !== 'web') {
      try {
        await Updates.reloadAsync();
      } catch (e) {
        // If Updates.reloadAsync fails, just reset the error state
        this.setState({ hasError: false, error: null, errorInfo: null });
      }
    } else {
      // On web, reload the page
      window.location.reload();
    }
  };

  handleReset = () => {
    // Just reset the error state and try to continue
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const errorText = `Error: ${error?.message}\n\nStack: ${error?.stack}\n\nComponent Stack: ${errorInfo?.componentStack}`;

    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(errorText);
    }
    // On native, you could use expo-clipboard here
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails } = this.state;

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            {/* Error Icon */}
            <View style={styles.iconContainer}>
              <AlertTriangle size={48} color="#EF4444" />
            </View>

            {/* Title */}
            <Text style={styles.title}>Something went wrong</Text>

            {/* Description */}
            <Text style={styles.description}>
              The app encountered an unexpected error. This has been automatically reported to our team.
            </Text>

            {/* Error Summary */}
            <View style={styles.errorSummary}>
              <Text style={styles.errorType}>
                {error?.name || 'Error'}
              </Text>
              <Text style={styles.errorMessage} numberOfLines={showDetails ? undefined : 2}>
                {error?.message || 'An unknown error occurred'}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <Pressable style={styles.primaryButton} onPress={this.handleRestart}>
                <RefreshCw size={20} color="#FFF" />
                <Text style={styles.primaryButtonText}>Restart App</Text>
              </Pressable>

              <Pressable style={styles.secondaryButton} onPress={this.handleReset}>
                <Text style={styles.secondaryButtonText}>Try to Continue</Text>
              </Pressable>
            </View>

            {/* Show Details Toggle */}
            <Pressable style={styles.detailsToggle} onPress={this.toggleDetails}>
              <Text style={styles.detailsToggleText}>
                {showDetails ? 'Hide' : 'Show'} Technical Details
              </Text>
              {showDetails ? (
                <ChevronUp size={16} color="#6B7280" />
              ) : (
                <ChevronDown size={16} color="#6B7280" />
              )}
            </Pressable>

            {/* Technical Details */}
            {showDetails && (
              <View style={styles.detailsContainer}>
                <View style={styles.detailsHeader}>
                  <Text style={styles.detailsTitle}>Stack Trace</Text>
                  {Platform.OS === 'web' && (
                    <Pressable style={styles.copyButton} onPress={this.handleCopyError}>
                      <Copy size={14} color="#6B7280" />
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </Pressable>
                  )}
                </View>
                <ScrollView style={styles.stackTrace} nestedScrollEnabled>
                  <Text style={styles.stackTraceText}>
                    {error?.stack || 'No stack trace available'}
                  </Text>
                  {errorInfo?.componentStack && (
                    <>
                      <Text style={[styles.detailsTitle, { marginTop: 16 }]}>
                        Component Stack
                      </Text>
                      <Text style={styles.stackTraceText}>
                        {errorInfo.componentStack}
                      </Text>
                    </>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorSummary: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  errorMessage: {
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F5C1A',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 4,
  },
  detailsToggleText: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailsContainer: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    maxHeight: 300,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  copyButtonText: {
    fontSize: 12,
    color: '#6B7280',
  },
  stackTrace: {
    maxHeight: 200,
  },
  stackTraceText: {
    fontSize: 11,
    color: '#D1D5DB',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
});

export default ErrorBoundary;

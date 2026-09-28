import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';

type ToastType = 'success' | 'error';

type ToastState = {
  visible: boolean;
  message: string;
  type: ToastType;
};

type ToastContextType = {
  show: (type: ToastType, message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

const AUTO_HIDE_MS = 3000;
const FADE_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
      setToast((t) => ({ ...t, visible: false }));
    });
  }, [opacity]);

  const show = useCallback(
    (type: ToastType, message: string) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ visible: true, message, type });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
    },
    [opacity, hide]
  );

  const showSuccess = useCallback((message: string) => show('success', message), [show]);
  const showError = useCallback((message: string) => show('error', message), [show]);

  return (
    <ToastContext.Provider value={{ show, showSuccess, showError }}>
      {children}
      {toast.visible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            toast.type === 'success' ? styles.success : styles.error,
            { opacity },
          ]}
        >
          <Text style={styles.text} numberOfLines={3}>
            {toast.message}
          </Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: Platform.OS === 'ios' ? 50 : 30,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  success: { backgroundColor: '#2E7D32' },
  error: { backgroundColor: '#C62828' },
  text: { color: '#FFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
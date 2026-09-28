import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { API_BASE_URL?: string };
const API_BASE_URL = extra.API_BASE_URL;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const handleSubmit = async () => {
    if (!email) {
      setMessage({ text: 'Enter your registered email', error: true });
      return;
    }
    if (!API_BASE_URL) {
      setMessage({ text: 'API base URL is not configured', error: true });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/mobile/staff/forgotpassword`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ text: data.message || 'Reset request sent successfully', error: false });
      } else {
        setMessage({ text: data.error || 'Could not process request', error: true });
      }
    } catch (error) {
      console.error('Error requesting password reset:', error);
      setMessage({ text: 'Could not connect to the server', error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="person-circle-outline" size={64} color="#4A5FFF" />
          </View>

          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>Enter valid details to proceed</Text>

          {message && (
            <Text style={[styles.message, message.error ? styles.messageError : styles.messageSuccess]}>
              {message.text}
            </Text>
          )}

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#a0a0c0" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter registration email"
              placeholderTextColor="#a0a0c0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Send request</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 20,
    padding: 5,
  },
  iconWrap: {
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    marginBottom: 25,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  messageError: {
    color: '#E53935',
  },
  messageSuccess: {
    color: '#2E7D32',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0FF',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 55,
    width: '100%',
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#4A5FFF',
    borderRadius: 12,
    height: 55,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
    letterSpacing: 0.5,
  },
});
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

const SOURCE_OPTIONS = ['Manual Entry', 'Referral', 'Walk-in', 'Marketing Campaign'];

function formattedToday() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function AddLeadScreen() {
  const router = useRouter();
  const { authFetch } = useAuth();
  const { showSuccess, showError } = useToast();

  const [submitting, setSubmitting] = useState(false);

  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [bdes, setBdes] = useState([]);

  const [formData, setFormData] = useState({
    date: formattedToday(),
    full_name: '',
    phone: '',
    business_nature: '',
    location: '',
    branch: '',
    product_interest: '',
    source: '',
    bde: '',
  });

  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showBdePicker, setShowBdePicker] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const loadFormData = useCallback(async () => {
    try {
      const res = await authFetch('/api/mobile/staff/leads/form-data', { method: 'GET' });

      // Read as text first so a non-JSON response (auth failure, a 404
      // page, a stack trace) is visible instead of throwing an opaque
      // "Unexpected character: <" SyntaxError.
      const raw = await res.text();
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        console.error('form-data returned non-JSON body:', raw.slice(0, 300));
        throw new Error('Server returned an unexpected (non-JSON) response. Check console.');
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to load form data (${res.status})`);
      }
      setBranches(json.payload.branches || []);
      setProducts(json.payload.products || []);
      // Web relies on server-rendered options for BDEs and ignores this
      // array; mobile has no template to fall back on, so use it directly.
      setBdes(json.payload.bdes || []);
    } catch (error) {
      console.error('Error fetching dropdown data:', error);
      showError(error.message || 'Failed to load form data');
    }
  }, [authFetch, showError]);

  useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  const handleSubmit = async () => {
    if (
      !formData.full_name.trim() ||
      !formData.phone.trim() ||
      !formData.branch ||
      !formData.product_interest ||
      !formData.bde
    ) {
      showError('Please fill all required fields and select options.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/mobile/staff/leads/create', {
        method: 'POST',
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim(),
          business_nature: formData.business_nature.trim(),
          location: formData.location.trim(),
          branch: formData.branch,
          product_interest: formData.product_interest,
          source: formData.source || 'Manual Entry',
          bde: formData.bde,
          date: formData.date, // accepted but currently ignored server-side
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit lead');
      }

      showSuccess('Lead submitted successfully!');
      router.back();
    } catch (error) {
      console.error('Error submitting lead:', error);
      showError(error.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderDropdown = (label, value, placeholder, options, showPicker, setShowPicker, field) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setShowPicker(!showPicker)}>
        <Text style={value ? styles.dropdownText : styles.placeholderText}>
          {value ? options.find((o) => String(o.id) === String(value))?.name || placeholder : placeholder}
        </Text>
        <Text style={styles.dropdownIcon}>▼</Text>
      </TouchableOpacity>
      {showPicker && (
        <View style={styles.pickerContainer}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.length === 0 ? (
              <View style={styles.pickerItem}>
                <Text style={styles.placeholderText}>Loading...</Text>
              </View>
            ) : (
              options.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.pickerItem}
                  onPress={() => {
                    handleInputChange(field, option.id);
                    setShowPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{option.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderSourceDropdown = () => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>Source</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setShowSourcePicker(!showSourcePicker)}>
        <Text style={formData.source ? styles.dropdownText : styles.placeholderText}>
          {formData.source || '- Select Source -'}
        </Text>
        <Text style={styles.dropdownIcon}>▼</Text>
      </TouchableOpacity>
      {showSourcePicker && (
        <View style={styles.pickerContainer}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {SOURCE_OPTIONS.map((source, index) => (
              <TouchableOpacity
                key={index}
                style={styles.pickerItem}
                onPress={() => {
                  handleInputChange('source', source);
                  setShowSourcePicker(false);
                }}
              >
                <Text style={styles.pickerItemText}>{source}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Lead</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter full name"
            placeholderTextColor="#999"
            value={formData.full_name}
            onChangeText={(text) => handleInputChange('full_name', text)}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter phone number"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
            value={formData.phone}
            onChangeText={(text) => handleInputChange('phone', text)}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Nature of Business</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter nature of business"
            placeholderTextColor="#999"
            value={formData.business_nature}
            onChangeText={(text) => handleInputChange('business_nature', text)}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter location"
            placeholderTextColor="#999"
            value={formData.location}
            onChangeText={(text) => handleInputChange('location', text)}
          />
        </View>

        {renderDropdown(
          'Branch',
          formData.branch,
          '- Select Branch -',
          branches,
          showBranchPicker,
          setShowBranchPicker,
          'branch'
        )}
        {renderDropdown(
          'Product of Interest',
          formData.product_interest,
          '- Select Product -',
          products,
          showProductPicker,
          setShowProductPicker,
          'product_interest'
        )}
        {renderSourceDropdown()}
        {renderDropdown('BDE', formData.bde, '- Select BDE -', bdes, showBdePicker, setShowBdePicker, 'bde')}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Date</Text>
          <View style={styles.dateInputContainer}>
            <Text style={styles.dateText}>{formData.date}</Text>
            <Text style={styles.calendarIcon}>📅</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Lead</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: '#4A90E2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  backButton: { marginRight: 15 },
  backIcon: { color: '#FFF', fontSize: 24, fontWeight: '600' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollViewContent: { padding: 20, paddingBottom: 120 },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
  },
  dateInputContainer: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: { fontSize: 14, color: '#333' },
  calendarIcon: { fontSize: 18 },
  dropdown: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: { fontSize: 14, color: '#333' },
  placeholderText: { fontSize: 14, color: '#999' },
  dropdownIcon: { fontSize: 10, color: '#666' },
  pickerContainer: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    marginTop: 5,
    maxHeight: 200,
  },
  pickerItem: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pickerItemText: { fontSize: 14, color: '#333' },
  submitButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});


import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ACCENT = '#2D5BFF';

type Lead = {
  id: number;
  name: string;
  phone_number: string;
  business_nature: string | null;
  branch: { id: number; name: string } | null;
};

type Bde = { id: number; name: string };

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

const MARKETING_TYPES = [
  { value: 'routine', label: 'Routine' },
  { value: 'activation', label: 'Activation' },
  { value: 'referral', label: 'Referrals' },
  { value: 'online', label: 'Online' },
];
const STOCK_TYPES = [
  { value: 'services', label: 'Services' },
  { value: 'perishable', label: 'Perishable' },
  { value: 'non_perishable', label: 'Non-perishable' },
];
const LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const CHARACTER = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

function ChipSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function YesNoToggle({ value, onChange }: { value: 'yes' | 'no' | ''; onChange: (v: 'yes' | 'no') => void }) {
  return (
    <View style={styles.chipRow}>
      {(['yes', 'no'] as const).map((opt) => {
        const selected = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt === 'yes' ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function AssessmentModal({
  visible,
  lead,
  authFetch,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  lead: Lead | null;
  authFetch: AuthFetch;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [loadingFormData, setLoadingFormData] = useState(false);
  const [bdes, setBdes] = useState<Bde[]>([]);
  const [showBdePicker, setShowBdePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [marketingType, setMarketingType] = useState('');
  const [businessNature, setBusinessNature] = useState('');
  const [premiseType, setPremiseType] = useState('');
  const [stockType, setStockType] = useState('');
  const [stockLevel, setStockLevel] = useState('');
  const [interestLevel, setInterestLevel] = useState('');
  const [personalCharacter, setPersonalCharacter] = useState('');
  const [ownsBusiness, setOwnsBusiness] = useState<'yes' | 'no' | ''>('');
  const [isLegitimate, setIsLegitimate] = useState<'yes' | 'no' | ''>('');
  const [loanPurpose, setLoanPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [loanOfficerId, setLoanOfficerId] = useState<number | null>(null);

  // Prefill from the lead, and fetch the BDE list, whenever the modal opens.
  useEffect(() => {
    if (!visible || !lead) return;
    setName(lead.name || '');
    setPhone(lead.phone_number || '');
    setBranch(lead.branch?.name || '');
    setBusinessNature(lead.business_nature || '');
    setMarketingType('');
    setPremiseType('');
    setStockType('');
    setStockLevel('');
    setInterestLevel('');
    setPersonalCharacter('');
    setOwnsBusiness('');
    setIsLegitimate('');
    setLoanPurpose('');
    setNotes('');
    setLoanOfficerId(null);

    setLoadingFormData(true);
    authFetch('/api/mobile/staff/leads/form-data')
      .then((res) => res.json())
      .then((json) => {
     
        if (json.success) setBdes(json.payload.loan_officers || []);
      })
      .catch((e) => console.warn('[AssessmentModal] form-data fetch failed:', e))
      .finally(() => setLoadingFormData(false));
  }, [visible, lead, authFetch]);

  const selectedBde = bdes.find((b) => b.id === loanOfficerId) || null;

  const handleSubmit = async () => {
    if (!lead) return;
    const required: Record<string, string> = {
      Name: name,
      'Phone number': phone,
      Branch: branch,
      'Nature of business': businessNature,
      'Business premise type': premiseType,
      'Stock type': stockType,
      'Stock level': stockLevel,
      'Level of interest': interestLevel,
      'Personal character': personalCharacter,
      'Purpose of loan': loanPurpose,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (!ownsBusiness) missing.push('Business ownership');
    if (!isLegitimate) missing.push('Business legitimacy');
    if (missing.length) {
      Alert.alert('Missing details', `Please fill in: ${missing.join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/mobile/staff/leads/${lead.id}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone_number: phone,
          branch,
          marketing_type: marketingType,
          business_nature: businessNature,
          premise_type: premiseType,
          stock_type: stockType,
          stock_level: stockLevel,
          interest_level: interestLevel,
          personal_character: personalCharacter,
          owns_business: ownsBusiness,
          is_legitimate: isLegitimate,
          loan_purpose: loanPurpose,
          notes,

          loan_officer: selectedBde?.name ?? '',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to submit assessment');
      }
      onSubmitted();
    } catch (e: any) {
      Alert.alert('Submission failed', e?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color="#000" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Initial Lead Assessment</Text>
            <Text style={styles.headerSubtitle}>Complete the assessment form for this lead</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Field label="Name">
            <TextInput style={styles.input} value={name} onChangeText={setName} />
          </Field>
          <Field label="Phone Number">
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </Field>
          <Field label="Branch">
            <TextInput style={styles.input} value={branch} onChangeText={setBranch} />
          </Field>

          <Field label="Marketing Type">
            <ChipSelect options={MARKETING_TYPES} value={marketingType} onChange={setMarketingType} />
          </Field>
          <Field label="Nature of Business">
            <TextInput style={styles.input} value={businessNature} onChangeText={setBusinessNature} />
          </Field>
          <Field label="Business Premise Type">
            <TextInput style={styles.input} value={premiseType} onChangeText={setPremiseType} />
          </Field>

          <Field label="Stock Type">
            <ChipSelect options={STOCK_TYPES} value={stockType} onChange={setStockType} />
          </Field>
          <Field label="Stock Level">
            <ChipSelect options={LEVELS} value={stockLevel} onChange={setStockLevel} />
          </Field>
          <Field label="Level of Interest">
            <ChipSelect options={LEVELS} value={interestLevel} onChange={setInterestLevel} />
          </Field>

          <Field label="Personal Character">
            <ChipSelect options={CHARACTER} value={personalCharacter} onChange={setPersonalCharacter} />
          </Field>
          <Field label="Business Ownership">
            <YesNoToggle value={ownsBusiness} onChange={setOwnsBusiness} />
          </Field>
          <Field label="Business Legitimacy">
            <YesNoToggle value={isLegitimate} onChange={setIsLegitimate} />
          </Field>

          <Field label="Purpose of Loan">
            <TextInput
              style={[styles.input, styles.textarea]}
              value={loanPurpose}
              onChangeText={setLoanPurpose}
              multiline
            />
          </Field>
          <Field label="Notes (optional)">
            <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} multiline />
          </Field>

          <Field label="Loan Officer">
            {loadingFormData ? (
              <ActivityIndicator color={ACCENT} />
            ) : (
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowBdePicker(true)}>
                <Text style={styles.pickerButtonText}>{selectedBde ? selectedBde.name : '-- Select BDE --'}</Text>
                <Ionicons name="chevron-down" size={16} color="#666" />
              </TouchableOpacity>
            )}
          </Field>

          <TouchableOpacity
            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>Submit Assessment</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>

      <Modal visible={showBdePicker} animationType="fade" transparent onRequestClose={() => setShowBdePicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowBdePicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerSheetTitle}>Select BDE</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {bdes.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setLoanOfficerId(b.id);
                    setShowBdePicker(false);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{b.name}</Text>
                  {loanOfficerId === b.id && <Ionicons name="checkmark" size={18} color={ACCENT} />}
                </TouchableOpacity>
              ))}
              {bdes.length === 0 && <Text style={styles.pickerEmptyText}>No BDEs found.</Text>}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#000' },
  headerSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
    backgroundColor: '#FAFAFA',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  chipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 13, color: '#333' },
  chipTextSelected: { color: '#FFF', fontWeight: '600' },

  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
  },
  pickerButtonText: { fontSize: 14, color: '#000' },

  submitButton: { backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 30 },
  pickerSheet: { backgroundColor: '#FFF', borderRadius: 14, padding: 16 },
  pickerSheetTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 8, color: '#000' },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pickerOptionText: { fontSize: 14, color: '#000' },
  pickerEmptyText: { fontSize: 13, color: '#9E9E9E', paddingVertical: 16, textAlign: 'center' },
});
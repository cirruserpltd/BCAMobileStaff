import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  KeyboardTypeOptions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

const ACCENT = '#2D5BFF';
const API = '/api/mobile/staff/members';
const BATCH_SIZE = 3;
const STEPS = ['Personal info', 'Residential info', 'Dependants & next of kin', 'Source of income', 'Attachments'];

type Img = { uri: string; type: string } | null;
type Errors = Record<string, string>;
type Option = { value: string; label: string };
type Person = {
  name: string; id: string; kra_pin: string; address: string; phone: string;
  passport: Img; id_front: Img; id_back: Img; kra: Img;
};
type License = { type: string; number: string; expiry_date: string; copy: Img };
type Dependant = { name: string; age: string };
type PickPhoto = (label: string, cb: (img: Img) => void) => void;

const YES_NO: Option[] = [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }];
const MARITAL: Option[] = [
  { value: 'married', label: 'Married' },
  { value: 'single', label: 'Single' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'windowed', label: 'Widowed' }, // value spelling matches the web form
];
const GENDER: Option[] = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }];
const OWNERSHIP: Option[] = [
  { value: 'owner', label: 'Sole proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'limited', label: 'Limited company' },
];
const TERMS: Option[] = [{ value: 'permanent', label: 'Permanent' }, { value: 'contract', label: 'Contract' }];

const REQUIRED_IMAGES = [
  { key: 'profile_pic', label: 'Profile image' },
  { key: 'id_front', label: 'ID front' },
  { key: 'id_back', label: 'ID back' },
  { key: 'client_sign_img', label: 'Client signature' },
];

const emptyPerson = (): Person => ({
  name: '', id: '', kra_pin: '', address: '', phone: '',
  passport: null, id_front: null, id_back: null, kra: null,
});
const emptyLicense = (): License => ({ type: '', number: '', expiry_date: '', copy: null });

// ---------- date helpers (web uses dd/mm/yyyy for members, yyyy-mm-dd for <input type="date">) ----------
const maskDMY = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};
const maskYMD = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join('-');
};
const parseDMY = (s: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? d : null;
};
const validYMD = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};
const todayDMY = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const clean = (v?: string) => (!v || v === 'undefined' || v === 'null' ? '' : v);

// ---------- date <-> Date object helpers, for the native picker ----------
const dmyToDate = (s: string) => {
  const d = parseDMY(s);
  return d || new Date();
};
const ymdToDate = (s: string) => {
  if (!validYMD(s)) return new Date();
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
};
const dateToDMY = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const dateToYMD = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ---------- small UI pieces ----------
function Field(props: {
  label: string; value: string; onChangeText: (t: string) => void; error?: string;
  keyboardType?: KeyboardTypeOptions; multiline?: boolean; placeholder?: string; maxLength?: number; optional?: boolean;
}) {
  const { label, value, onChangeText, error, keyboardType, multiline, placeholder, maxLength, optional } = props;
  return (
    <View style={s.field}>
      <Text style={s.label}>
        {label}
        {optional ? <Text style={s.optional}> (optional)</Text> : null}
      </Text>
      <TextInput
        style={[s.input, multiline && s.multiline, !!error && s.inputError]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#BDBDBD"
        multiline={multiline}
        maxLength={maxLength}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

function DateField(props: {
  label: string; value: string; mode: 'dmy' | 'ymd';
  onChange: (v: string) => void; error?: string; optional?: boolean;
  minimumDate?: Date; maximumDate?: Date;
}) {
  const { label, value, mode, onChange, error, optional, minimumDate, maximumDate } = props;
  const [open, setOpen] = useState(false);
  const current = value ? (mode === 'dmy' ? dmyToDate(value) : ymdToDate(value)) : new Date();

  const handleChange = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(mode === 'dmy' ? dateToDMY(selected) : dateToYMD(selected));
  };

  return (
    <View style={s.field}>
      <Text style={s.label}>
        {label}
        {optional ? <Text style={s.optional}> (optional)</Text> : null}
      </Text>
      <TouchableOpacity style={[s.input, s.selectBox, !!error && s.inputError]} onPress={() => setOpen(true)}>
        <Text style={value ? s.inputText : s.placeholder}>
          {value || (mode === 'dmy' ? 'DD/MM/YYYY' : 'YYYY-MM-DD')}
        </Text>
        <Ionicons name="calendar-outline" size={16} color="#9E9E9E" />
      </TouchableOpacity>
      {!!error && <Text style={s.error}>{error}</Text>}

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={current}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{label}</Text>
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                  <Text style={{ color: ACCENT, fontWeight: '700', fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={current}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={handleChange}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function Segmented(props: { label: string; options: Option[]; value: string; onChange: (v: string) => void; error?: string }) {
  const { label, options, value, onChange, error } = props;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.segRow}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.value}
            style={[s.seg, value === o.value && s.segActive, !!error && value !== o.value && s.segError]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[s.segText, value === o.value && s.segTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={s.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? ACCENT : '#9E9E9E'} />
      <Text style={s.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Select(props: { label: string; value: string; options: Option[]; onChange: (v: string) => void; error?: string }) {
  const { label, value, options, onChange, error } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={[s.input, s.selectBox, !!error && s.inputError]} onPress={() => setOpen(true)}>
        <Text style={current ? s.inputText : s.placeholder} numberOfLines={1}>
          {current ? current.label : 'Select…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#9E9E9E" />
      </TouchableOpacity>
      {!!error && <Text style={s.error}>{error}</Text>}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#000" />
              </TouchableOpacity>
            </View>
            {options.length > 10 && (
              <TextInput style={[s.input, { marginBottom: 8 }]} placeholder="Search" value={q} onChangeText={setQ} />
            )}
            <FlatList
              data={shown}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.optionRow}
                  onPress={() => {
                    onChange(item.value);
                    setQ('');
                    setOpen(false);
                  }}
                >
                  <Text style={[s.optionText, item.value === value && { color: ACCENT, fontWeight: '700' }]}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ImageField(props: { label: string; img: Img; onPick: () => void; onClear: () => void; error?: string; optional?: boolean }) {
  const { label, img, onPick, onClear, error, optional } = props;
  return (
    <View style={s.field}>
      <Text style={s.label}>
        {label}
        {optional ? <Text style={s.optional}> (optional)</Text> : null}
      </Text>
      <View style={[s.imageBox, !!error && s.inputError]}>
        {img ? <Image source={{ uri: img.uri }} style={s.thumb} /> : <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="image-outline" size={22} color="#BDBDBD" /></View>}
        <TouchableOpacity style={s.imageBtn} onPress={onPick}>
          <Ionicons name="camera-outline" size={16} color={ACCENT} />
          <Text style={s.imageBtnText}>{img ? 'Change' : 'Add photo'}</Text>
        </TouchableOpacity>
        {img && (
          <TouchableOpacity onPress={onClear} hitSlop={8} style={{ marginLeft: 12 }}>
            <Ionicons name="trash-outline" size={20} color="#C62828" />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

function PersonCard(props: {
  title: string; person: Person; onChange: (p: Partial<Person>) => void; onRemove?: () => void; pickPhoto: PickPhoto;
}) {
  const { title, person, onChange, onRemove, pickPhoto } = props;
  const shots: [keyof Person, string][] = [
    ['passport', 'Passport photo'], ['id_front', 'ID front'], ['id_back', 'ID back'], ['kra', 'KRA PIN copy'],
  ];
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>{title}</Text>
        {onRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <Ionicons name="trash-outline" size={20} color="#C62828" />
          </TouchableOpacity>
        )}
      </View>
      <Field label="Name" value={person.name} onChangeText={(t) => onChange({ name: t })} optional />
      <Field label="ID" value={person.id} onChangeText={(t) => onChange({ id: t })} optional />
      <Field label="KRA PIN" value={person.kra_pin} onChangeText={(t) => onChange({ kra_pin: t })} optional />
      <Field label="Physical address" value={person.address} onChangeText={(t) => onChange({ address: t })} optional />
      <Field label="Telephone no" value={person.phone} onChangeText={(t) => onChange({ phone: t })} keyboardType="phone-pad" optional />
      {shots.map(([k, lbl]) => (
        <ImageField
          key={k}
          label={lbl}
          optional
          img={person[k] as Img}
          onPick={() => pickPhoto(lbl, (img) => onChange({ [k]: img } as Partial<Person>))}
          onClear={() => onChange({ [k]: null } as Partial<Person>)}
        />
      ))}
    </View>
  );
}

const patchRow = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, i: number, p: Partial<T>) =>
  setter((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

// ---------- screen ----------
export default function OnboardMemberScreen() {
  const { authFetch } = useAuth();
  const { showSuccess, showError } = useToast();
  const params = useLocalSearchParams<Record<string, string>>();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [f, setF] = useState<Record<string, string>>(() => {
    const [surname, ...rest] = clean(params.name).trim().split(/\s+/);
    return {
      surname: surname || '',
      other_names: rest.join(' '),
      phone: clean(params.phone),
      branch_id: clean(params.branch_id),
      team_id: clean(params.team_id),
      created_at: todayDMY(),
      employment_terms: 'permanent',
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [partners, setPartners] = useState<Person[]>([emptyPerson()]);
  const [directors, setDirectors] = useState<Person[]>([emptyPerson()]);
  const [licenses, setLicenses] = useState<License[]>([emptyLicense()]);
  const [images, setImages] = useState<Record<string, Img>>({});

  const [opts, setOpts] = useState<{ branches: Option[]; teams: Option[] } | null>(null);
  const [canCreate, setCanCreate] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const memberIdRef = useRef<string | null>(null); // set once the member row exists
  const uploadedRef = useRef<Set<string>>(new Set()); // image keys already on the server
  const [saved, setSaved] = useState(false); // mirrors memberIdRef for rendering

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API}/individual/form-data`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load form data');
        const p = json.payload;
        setCanCreate(!!p.can_create);
        setOpts({
          branches: p.branches.map((b: any) => ({ value: String(b.id), label: b.name })),
          teams: p.teams.map((t: any) => ({ value: String(t.id), label: t.name })),
        });
      } catch (e: any) {
        showError(e?.message || 'Failed to load form data');
        router.back();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const set = (k: string, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      if (!p[k]) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  const setImage = (key: string, img: Img) => {
    uploadedRef.current.delete(key); // a replaced image must be uploaded again
    setImages((p) => ({ ...p, [key]: img }));
    setErrors((p) => {
      if (!p[key]) return p;
      const n = { ...p };
      delete n[key];
      return n;
    });
  };

  // ----- photo capture -----
  const capture = async (source: 'camera' | 'library'): Promise<Img> => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showError('Camera permission is required');
        return null;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (res.canceled || !res.assets?.length) return null;
    const a = res.assets[0];
    return { uri: a.uri, type: a.mimeType || 'image/jpeg' };
  };

  const pickPhoto: PickPhoto = (label, cb) => {
    Alert.alert(label, 'Add a photo', [
      { text: 'Camera', onPress: async () => { const i = await capture('camera'); if (i) cb(i); } },
      { text: 'Gallery', onPress: async () => { const i = await capture('library'); if (i) cb(i); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ----- validation (mirrors validateIndividualStep1-4 on the web) -----
  const validate = (n: number): Errors => {
    const e: Errors = {};
    const req = (k: string) => { if (!(f[k] || '').trim()) e[k] = 'Required'; };

    if (n === 0) {
      ['surname', 'other_names', 'alias', 'id_no', 'phone', 'created_at', 'dob', 'branch_id', 'team_id', 'marital_status', 'gender'].forEach(req);
      if (f.dob && !e.dob) {
        const d = parseDMY(f.dob);
        const max = new Date();
        max.setFullYear(max.getFullYear() - 17);
        if (!d) e.dob = 'Use DD/MM/YYYY';
        else if (d < new Date(1920, 0, 1)) e.dob = 'Invalid date';
        else if (d > max) e.dob = 'Member must be at least 17';
      }
      if (f.created_at && !e.created_at) {
        const d = parseDMY(f.created_at);
        if (!d) e.created_at = 'Use DD/MM/YYYY';
        else if (d > new Date()) e.created_at = 'Cannot be in the future';
      }
    }

    if (n === 1) {
      ['town', 'county', 'village', 'building_name', 'location_description'].forEach(req);
    }

    if (n === 2) {
      ['next_of_kin_name', 'next_of_kin_location', 'next_of_kin_phone', 'next_of_kin_relationship'].forEach(req);
      dependants.forEach((d, i) => {
        if (!d.name.trim()) e[`dep_${i}_name`] = 'Enter a name';
        if (!d.age.trim()) e[`dep_${i}_age`] = 'Enter an age';
      });
    }

    if (n === 3) {
      const emp = f.is_employed === '1', biz = f.has_business === '1', farm = f.is_farmer === '1';
      if (!emp && !biz && !farm) e.income = 'Select at least one source of income';
      if (emp) {
        ['employer_name', 'payroll_no', 'salary_bank', 'salary_account_name', 'salary_account_no', 'salary_account_branch', 'work_county', 'work_sub_county'].forEach(req);
        if (f.employment_terms === 'contract' && f.contract_expiry && !validYMD(f.contract_expiry)) e.contract_expiry = 'Use YYYY-MM-DD';
      }
      if (farm) ['farm_county', 'farm_sub_county', 'farm_location', 'farm_sub_location', 'farm_village', 'farm_road_street'].forEach(req);
      if (biz) {
        ['business_name', 'business_type', 'start_year', 'employees_no', 'business_town', 'business_location', 'business_owner', 'is_registered', 'is_licensed'].forEach(req);
        if (f.start_year && !/^\d+$/.test(f.start_year)) e.start_year = 'Numbers only';
        if (f.employees_no && !/^\d+$/.test(f.employees_no)) e.employees_no = 'Numbers only';
        if (f.is_registered === '1' && f.registration_date && !validYMD(f.registration_date)) e.registration_date = 'Use YYYY-MM-DD';
        if (f.is_licensed === '1') {
          ['license_agency', 'license_number', 'expiry_date'].forEach(req);
          if (f.expiry_date && !e.expiry_date && !validYMD(f.expiry_date)) e.expiry_date = 'Use YYYY-MM-DD';
        }
        if (f.other_license === '1') {
          const l = licenses[0];
          if (!l.type.trim()) e.lic_0_type = 'Required';
          if (!l.number.trim()) e.lic_0_number = 'Required';
          if (!l.expiry_date.trim()) e.lic_0_expiry = 'Required';
          licenses.forEach((row, i) => {
            if (row.expiry_date && !validYMD(row.expiry_date)) e[`lic_${i}_expiry`] = 'Use YYYY-MM-DD';
          });
        }
      }
    }

    if (n === 4) {
      REQUIRED_IMAGES.forEach(({ key }) => { if (!images[key]) e[key] = 'Required'; });
    }
    return e;
  };

  // ----- request building -----
  const buildPayload = () => {
    const p: Record<string, any> = {};
    [
      'surname', 'other_names', 'alias', 'id_no', 'created_at', 'dob', 'po_box', 'postal_code', 'phone', 'alt_phone_no',
      'branch_id', 'team_id', 'marital_status', 'gender', 'town', 'county', 'village', 'building_name', 'floor_no',
      'door_no', 'location_description', 'next_of_kin_name', 'next_of_kin_location', 'next_of_kin_phone', 'next_of_kin_relationship',
    ].forEach((k) => { p[k] = (f[k] || '').trim(); });
    p.dependants = dependants.map((d) => ({ name: d.name.trim(), age: d.age.trim() }));
    if (clean(params.lead_id)) p.lead_id = params.lead_id;

    const copy = (keys: string[]) => keys.forEach((k) => { p[k] = (f[k] || '').trim(); });
    const emp = f.is_employed === '1', biz = f.has_business === '1', farm = f.is_farmer === '1';

    if (emp) {
      p.is_employed = '1';
      copy(['employer_name', 'payroll_no', 'salary_bank', 'salary_account_name', 'salary_account_no', 'salary_account_branch', 'work_county', 'work_sub_county']);
      p.employment_terms = f.employment_terms || 'permanent';
      if (f.employment_terms === 'contract') p.contract_expiry = (f.contract_expiry || '').trim();
    }
    if (farm) {
      p.is_farmer = '1';
      copy(['farm_county', 'farm_sub_county', 'farm_location', 'farm_sub_location', 'farm_village', 'farm_road_street', 'farm_detailed_description']);
    }
    if (biz) {
      p.has_business = '1';
      copy(['business_name', 'business_type', 'start_year', 'employees_no', 'business_town', 'business_location', 'business_owner', 'is_registered', 'is_licensed']);
      if (f.other_license) p.other_license = f.other_license;
      if (f.is_registered === '1') copy(['registration_date', 'certificate_number']);
      if (f.is_licensed === '1') copy(['license_agency', 'license_number', 'expiry_date']);

      const people = (list: Person[]) =>
        list
          .filter((x) => x.name || x.id || x.kra_pin || x.address || x.phone)
          .map((x) => ({ name: x.name.trim(), id: x.id.trim(), kra_pin: x.kra_pin.trim(), address: x.address.trim(), phone: x.phone.trim() }));
      if (f.business_owner === 'limited') p.director_details = people(directors);
      if (f.business_owner === 'partnership') p.partner_details = people(partners);
      if (f.other_license === '1') {
        p.other_license_details = licenses
          .filter((l) => l.type || l.number || l.expiry_date)
          .map((l) => ({ type: l.type.trim(), number: l.number.trim(), expiry_date: l.expiry_date.trim() }));
      }
    }
    return p;
  };

  // file keys match the ids/names the web form uses (partner-passport-photo_1, cr12_upload, ...)
  const collectFiles = () => {
    const biz = f.has_business === '1';
    const wanted = new Set(['profile_pic', 'id_front', 'id_back', 'client_sign_img', 'additional_documents1', 'additional_documents2']);
    if (biz && f.business_owner === 'partnership') ['partnership_deed_upload', 'partnership_resolution_upload'].forEach((k) => wanted.add(k));
    if (biz && f.business_owner === 'limited') ['cr12_upload', 'company_kra_upload', 'board_resolution_upload'].forEach((k) => wanted.add(k));
    if (biz && f.is_registered === '1') wanted.add('registration_imgs');
    if (biz && f.is_licensed === '1') wanted.add('license_imgs');

    const out: { key: string; img: NonNullable<Img> }[] = [];
    Object.entries(images).forEach(([key, img]) => { if (img && wanted.has(key)) out.push({ key, img }); });

    const rows = (prefix: string, list: Person[]) =>
      list.forEach((p, i) => {
        const n = i + 1;
        if (p.passport) out.push({ key: `${prefix}-passport-photo_${n}`, img: p.passport });
        if (p.id_front) out.push({ key: `${prefix}-id-front_${n}`, img: p.id_front });
        if (p.id_back) out.push({ key: `${prefix}-id-back_${n}`, img: p.id_back });
        if (p.kra) out.push({ key: `${prefix}-kra-upload_${n}`, img: p.kra });
      });
    if (biz && f.business_owner === 'partnership') rows('partner', partners);
    if (biz && f.business_owner === 'limited') rows('director', directors);
    if (biz && f.other_license === '1') licenses.forEach((l, i) => { if (l.copy) out.push({ key: `license-upload_${i + 1}`, img: l.copy }); });
    return out;
  };

  const postJson = async (path: string, body: object) => {
    const res = await authFetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      const err: any = new Error(json.error || 'Request failed');
      err.existingMemberId = json.existing_member_id;
      err.uploadedImages = json.uploaded_images;
      throw err;
    }
    return json;
  };

  const postUploads = async (buildFd: () => FormData) => {
    const res = await authFetch(
      `${API}/individual/${memberIdRef.current}/uploads`,
      { method: 'POST', body: buildFd() },
      buildFd
    );
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
    return json;
  };

  const submit = async () => {
    try {
      if (!memberIdRef.current) {
        setBusy('Saving member details…');
        const json = await postJson('/individual', buildPayload());
        memberIdRef.current = String(json.payload.id);
        setSaved(true);
      }

      const files = collectFiles().filter((x) => !uploadedRef.current.has(x.key));
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        setBusy(`Uploading images ${Math.min(i + BATCH_SIZE, files.length)} of ${files.length}…`);
        const buildFd = () => {
          const fd = new FormData();
          batch.forEach(({ key, img }) => {
            console.log('APPEND', key, JSON.stringify(img)); // <-- temp
            if (typeof img?.uri !== 'string' || !img.uri) {
              console.warn('BAD IMAGE', key, img);
            }
            fd.append(key, { uri: img.uri, name: `${key}.jpg`, type: img.type } as any);
          });
          return fd;
        };
        await postUploads(buildFd);
        batch.forEach((b) => uploadedRef.current.add(b.key));
      }

      setBusy('Finishing…');
      const buildFin = () => {
        const fin = new FormData();
        fin.append('finalize', '1');
        const leadId = clean(Array.isArray(params.lead_id) ? params.lead_id[0] : params.lead_id);
        console.log('LEAD_ID', JSON.stringify(leadId));
        if (leadId) fin.append('lead_id', String(leadId));
        return fin;
      };
      const json = await postUploads(buildFin);

      showSuccess(json.message || 'Member onboarded successfully');
      router.back();
    } catch (e: any) {
      showError(e?.message || 'Failed to onboard member');
    } finally {
      setBusy(null);
    }
  };

  const next = async () => {
    if (busy) return;
    const errs = validate(step);
    setErrors(errs);
    if (Object.keys(errs).length) {
      showError('Please fix the highlighted fields');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (step === 0 && !memberIdRef.current) {
      try {
        setBusy('Checking ID and phone…');
        await postJson('/individual/check-duplicates', {
          id_no: f.id_no, phone: f.phone, alt_phone_no: f.alt_phone_no || ''
        });
      } catch (e: any) {
        if (e.existingMemberId) {
          memberIdRef.current = String(e.existingMemberId);
          setSaved(true);
          uploadedRef.current = new Set(Array.isArray(e.uploadedImages) ? e.uploadedImages : []);
          showSuccess('Resuming a previous onboarding — only attachments are left');
          setStep(4); 
          return;
        }
        showError(e?.message || 'Could not check for duplicates');
        return;
      } finally {
        setBusy(null);
      }
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  const back = () => {
    if (step > 0 && !saved) setStep(step - 1);
    else router.back();
  };

  // ----- render helpers (plain functions, so inputs keep focus) -----
  const txt = (k: string, label: string, o: { optional?: boolean; keyboardType?: KeyboardTypeOptions; multiline?: boolean } = {}) => (
    <Field key={k} label={label} value={f[k] || ''} onChangeText={(t) => set(k, t)} error={errors[k]} {...o} />
  );

  const date = (k: string, label: string, mode: 'dmy' | 'ymd', optional?: boolean) => {
    const bounds =
      k === 'dob'
        ? {
            minimumDate: new Date(1920, 0, 1),
            maximumDate: (() => {
              const d = new Date();
              d.setFullYear(d.getFullYear() - 17);
              return d;
            })(),
          }
        : k === 'created_at'
        ? { maximumDate: new Date() }
        : {};
    return (
      <DateField
        key={k}
        label={label}
        mode={mode}
        optional={optional}
        value={f[k] || ''}
        onChange={(v) => set(k, v)}
        error={errors[k]}
        {...bounds}
      />
    );
  };

  const radio = (k: string, label: string, options: Option[]) => (
    <Segmented key={k} label={label} options={options} value={f[k] || ''} onChange={(v) => set(k, v)} error={errors[k]} />
  );
  const photo = (key: string, label: string, optional?: boolean) => (
    <ImageField
      key={key}
      label={label}
      optional={optional}
      img={images[key] || null}
      error={errors[key]}
      onPick={() => pickPhoto(label, (img) => setImage(key, img))}
      onClear={() => setImage(key, null)}
    />
  );
  const toggle = (k: string) => set(k, f[k] === '1' ? '' : '1');

  if (!opts) {
    return (
      <SafeAreaView style={s.safeArea}>
        <ActivityIndicator style={{ marginTop: 80 }} color={ACCENT} size="large" />
      </SafeAreaView>
    );
  }
  if (!canCreate) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Onboard member</Text>
          <View style={{ width: 22 }} />
        </View>
        <Text style={s.deniedText}>Access denied. You do not have access to create a new member.</Text>
      </SafeAreaView>
    );
  }

  const emp = f.is_employed === '1', biz = f.has_business === '1', farm = f.is_farmer === '1';

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <TouchableOpacity onPress={back} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{STEPS[step]}</Text>
        <Text style={s.stepCount}>{step + 1}/{STEPS.length}</Text>
      </View>
      <View style={s.progressRow}>
        {STEPS.map((_, i) => (
          <View key={i} style={[s.progressBar, i <= step && { backgroundColor: ACCENT }]} />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {saved && step === 4 && (
            <Text style={s.notice}>Member details are saved. Only the images are left to upload.</Text>
          )}

          {step === 0 && (
            <>
              {txt('surname', 'Surname')}
              {txt('other_names', 'Other names')}
              {txt('alias', 'Alias (nickname)')}
              {txt('id_no', 'ID or passport no.')}
              {date('created_at', 'Created on', 'dmy')}
              {date('dob', 'Date of birth', 'dmy')}
              {txt('po_box', 'P.O. Box', { optional: true })}
              {txt('postal_code', 'Postal code', { optional: true })}
              {txt('phone', 'Phone no.', { keyboardType: 'phone-pad' })}
              {txt('alt_phone_no', 'Alt phone no.', { keyboardType: 'phone-pad', optional: true })}
              <Select label="Branch" value={f.branch_id || ''} options={opts.branches} onChange={(v) => set('branch_id', v)} error={errors.branch_id} />
              <Select label="Team" value={f.team_id || ''} options={opts.teams} onChange={(v) => set('team_id', v)} error={errors.team_id} />
              {radio('marital_status', 'Marital status', MARITAL)}
              {radio('gender', 'Gender', GENDER)}
            </>
          )}

          {step === 1 && (
            <>
              {txt('town', 'Town')}
              {txt('county', 'County')}
              {txt('village', 'Village / estate')}
              {txt('building_name', 'Name of building')}
              {txt('floor_no', 'Floor', { optional: true })}
              {txt('door_no', 'Door no.', { optional: true })}
              {txt('location_description', 'Detailed location description', { multiline: true })}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={s.section}>Next of kin</Text>
              {txt('next_of_kin_name', 'Name')}
              {txt('next_of_kin_location', 'Physical location')}
              {txt('next_of_kin_phone', 'Phone', { keyboardType: 'phone-pad' })}
              {txt('next_of_kin_relationship', 'Relationship')}

              <View style={s.sectionRow}>
                <Text style={s.section}>Dependants</Text>
                <TouchableOpacity style={s.addBtn} onPress={() => setDependants((p) => [...p, { name: '', age: '' }])}>
                  <Ionicons name="add-circle" size={20} color={ACCENT} />
                  <Text style={s.addBtnText}>Add dependant</Text>
                </TouchableOpacity>
              </View>
              {dependants.length === 0 && <Text style={s.hint}>No dependants added.</Text>}
              {dependants.map((d, i) => (
                <View key={i} style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardTitle}>Dependant {i + 1}</Text>
                    <TouchableOpacity onPress={() => setDependants((p) => p.filter((_, idx) => idx !== i))} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color="#C62828" />
                    </TouchableOpacity>
                  </View>
                  <Field label="Name" value={d.name} onChangeText={(t) => patchRow(setDependants, i, { name: t })} error={errors[`dep_${i}_name`]} />
                  <Field label="Age" value={d.age} onChangeText={(t) => patchRow(setDependants, i, { age: t.replace(/\D/g, '') })} keyboardType="number-pad" error={errors[`dep_${i}_age`]} />
                </View>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={s.label}>Source of income</Text>
              <View style={[s.card, !!errors.income && s.inputError]}>
                <CheckRow label="Business income" checked={biz} onToggle={() => { toggle('has_business'); setErrors((p) => ({ ...p, income: '' })); }} />
                <CheckRow label="Farming" checked={farm} onToggle={() => { toggle('is_farmer'); setErrors((p) => ({ ...p, income: '' })); }} />
                <CheckRow label="Employment" checked={emp} onToggle={() => { toggle('is_employed'); setErrors((p) => ({ ...p, income: '' })); }} />
              </View>
              {!!errors.income && <Text style={s.error}>{errors.income}</Text>}

              {farm && (
                <>
                  <Text style={s.section}>Farm address</Text>
                  {txt('farm_county', 'County')}
                  {txt('farm_sub_county', 'Sub-county')}
                  {txt('farm_location', 'Location')}
                  {txt('farm_sub_location', 'Sub-location')}
                  {txt('farm_village', 'Village')}
                  {txt('farm_road_street', 'Road / street')}
                  {txt('farm_detailed_description', 'Detailed description', { multiline: true, optional: true })}
                </>
              )}

              {emp && (
                <>
                  <Text style={s.section}>Employment details</Text>
                  {txt('employer_name', 'Name of employer')}
                  {txt('payroll_no', 'Payroll no')}
                  {txt('salary_bank', 'Salary account bank')}
                  {txt('salary_account_name', 'Salary account name')}
                  {txt('salary_account_no', 'Salary account no')}
                  {txt('salary_account_branch', 'Salary account branch')}
                  {txt('work_county', 'Work county')}
                  {txt('work_sub_county', 'Work sub-county')}
                  {radio('employment_terms', 'Terms of employment', TERMS)}
                  {f.employment_terms === 'contract' && date('contract_expiry', 'Expiry of contract', 'ymd', true)}
                </>
              )}

              {biz && (
                <>
                  <Text style={s.section}>Business information</Text>
                  {txt('business_name', 'Business name')}
                  {txt('business_type', 'Business type')}
                  {txt('start_year', 'Year started', { keyboardType: 'number-pad' })}
                  {txt('employees_no', 'No. of employees', { keyboardType: 'number-pad' })}
                  {txt('business_town', 'Town')}
                  {txt('business_location', 'Detailed business location')}
                  {radio('business_owner', 'Business ownership', OWNERSHIP)}
                  {radio('is_registered', 'Registered', YES_NO)}
                  {radio('is_licensed', 'Licensed', YES_NO)}
                  {radio('other_license', 'Any other licenses?', YES_NO)}

                  {f.business_owner === 'partnership' && (
                    <>
                      <View style={s.sectionRow}>
                        <Text style={s.section}>Partners</Text>
                        <TouchableOpacity style={s.addBtn} onPress={() => setPartners((p) => [...p, emptyPerson()])}>
                          <Ionicons name="add-circle" size={20} color={ACCENT} />
                          <Text style={s.addBtnText}>Add partner</Text>
                        </TouchableOpacity>
                      </View>
                      {partners.map((p, i) => (
                        <PersonCard
                          key={i}
                          title={`Partner ${i + 1}`}
                          person={p}
                          pickPhoto={pickPhoto}
                          onChange={(patch) => patchRow(setPartners, i, patch)}
                          onRemove={partners.length > 1 ? () => setPartners((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
                        />
                      ))}
                      <Text style={s.section}>Partnership documents</Text>
                      {photo('partnership_deed_upload', 'Partnership deed / agreement', true)}
                      {photo('partnership_resolution_upload', 'Partnership resolution to open an account', true)}
                    </>
                  )}

                  {f.business_owner === 'limited' && (
                    <>
                      <View style={s.sectionRow}>
                        <Text style={s.section}>Directors</Text>
                        <TouchableOpacity style={s.addBtn} onPress={() => setDirectors((p) => [...p, emptyPerson()])}>
                          <Ionicons name="add-circle" size={20} color={ACCENT} />
                          <Text style={s.addBtnText}>Add director</Text>
                        </TouchableOpacity>
                      </View>
                      {directors.map((p, i) => (
                        <PersonCard
                          key={i}
                          title={`Director ${i + 1}`}
                          person={p}
                          pickPhoto={pickPhoto}
                          onChange={(patch) => patchRow(setDirectors, i, patch)}
                          onRemove={directors.length > 1 ? () => setDirectors((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
                        />
                      ))}
                      <Text style={s.section}>Company documents</Text>
                      {photo('cr12_upload', 'CR-12 (not more than 30 days old)', true)}
                      {photo('company_kra_upload', 'Company KRA PIN', true)}
                      {photo('board_resolution_upload', 'Board resolution to open an account', true)}
                    </>
                  )}

                  {f.is_registered === '1' && (
                    <>
                      <Text style={s.section}>Business registration</Text>
                      {date('registration_date', 'Date of registration', 'ymd', true)}
                      {txt('certificate_number', 'Certificate number', { optional: true })}
                      {photo('registration_imgs', 'Registration certificate', true)}
                    </>
                  )}

                  {f.is_licensed === '1' && (
                    <>
                      <Text style={s.section}>Business license</Text>
                      {txt('license_agency', 'Issuing agency')}
                      {txt('license_number', 'License number')}
                      {date('expiry_date', 'Expiry', 'ymd')}
                      {photo('license_imgs', 'License copy', true)}
                    </>
                  )}

                  {f.other_license === '1' && (
                    <>
                      <View style={s.sectionRow}>
                        <Text style={s.section}>Other licenses</Text>
                        <TouchableOpacity style={s.addBtn} onPress={() => setLicenses((p) => [...p, emptyLicense()])}>
                          <Ionicons name="add-circle" size={20} color={ACCENT} />
                          <Text style={s.addBtnText}>Add license</Text>
                        </TouchableOpacity>
                      </View>
                      {licenses.map((l, i) => (
                        <View key={i} style={s.card}>
                          <View style={s.cardHeader}>
                            <Text style={s.cardTitle}>License {i + 1}</Text>
                            {licenses.length > 1 && (
                              <TouchableOpacity onPress={() => setLicenses((p) => p.filter((_, idx) => idx !== i))} hitSlop={8}>
                                <Ionicons name="trash-outline" size={20} color="#C62828" />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Field label="Issuing agency" value={l.type} onChangeText={(t) => patchRow(setLicenses, i, { type: t })} error={errors[`lic_${i}_type`]} />
                          <Field label="License / cert number" value={l.number} onChangeText={(t) => patchRow(setLicenses, i, { number: t })} error={errors[`lic_${i}_number`]} />
                          <Field
                            label="Expiry date"
                            value={l.expiry_date}
                            onChangeText={(t) => patchRow(setLicenses, i, { expiry_date: maskYMD(t) })}
                            keyboardType="number-pad"
                            placeholder="YYYY-MM-DD"
                            maxLength={10}
                            error={errors[`lic_${i}_expiry`]}
                          />
                          <ImageField
                            label="License copy"
                            optional
                            img={l.copy}
                            onPick={() => pickPhoto('License copy', (img) => patchRow(setLicenses, i, { copy: img }))}
                            onClear={() => patchRow(setLicenses, i, { copy: null })}
                          />
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {step === 4 && (
            <>
              {REQUIRED_IMAGES.map(({ key, label }) => photo(key, label))}
              {photo('additional_documents1', 'Additional document 1', true)}
              {photo('additional_documents2', 'Additional document 2', true)}
            </>
          )}
        </ScrollView>

        <View style={s.footer}>
          {step > 0 && !saved && (
            <TouchableOpacity style={s.backBtn} onPress={back} disabled={!!busy}>
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.nextBtn, !!busy && { opacity: 0.6 }]} onPress={next} disabled={!!busy}>
            <Text style={s.nextBtnText}>{step === STEPS.length - 1 ? (saved ? 'Retry upload' : 'Create member') : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {!!busy && (
        <View style={s.overlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={s.overlayText}>{busy}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 'bold', color: '#000', marginHorizontal: 8 },
  stepCount: { fontSize: 12, color: '#9E9E9E', width: 30, textAlign: 'right' },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingBottom: 8 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0' },
  body: { padding: 16, paddingBottom: 32 },
  notice: { backgroundColor: '#E3F2FD', color: ACCENT, padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 12 },
  deniedText: { textAlign: 'center', color: '#C62828', marginTop: 60, paddingHorizontal: 24 },

  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 6 },
  optional: { fontWeight: '400', color: '#9E9E9E' },
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#000', backgroundColor: '#FAFAFA',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  inputError: { borderColor: '#C62828' },
  inputText: { fontSize: 14, color: '#000', flex: 1 },
  placeholder: { fontSize: 14, color: '#BDBDBD', flex: 1 },
  selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { color: '#C62828', fontSize: 11, marginTop: 4 },
  hint: { color: '#9E9E9E', fontSize: 12, marginBottom: 12 },

  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seg: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  segActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  segError: { borderColor: '#C62828' },
  segText: { fontSize: 13, color: '#333' },
  segTextActive: { color: '#FFF', fontWeight: '700' },

  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  checkLabel: { fontSize: 14, color: '#000' },

  section: { fontSize: 15, fontWeight: '700', color: '#000', marginTop: 12, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { color: ACCENT, fontSize: 12, fontWeight: '700' },

  card: { borderWidth: 1, borderColor: '#EEEEEE', borderRadius: 12, padding: 12, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#000' },

  imageBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 8, backgroundColor: '#FAFAFA' },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  thumbEmpty: { backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  imageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 12 },
  imageBtnText: { color: ACCENT, fontWeight: '700', fontSize: 13 },

  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  backBtn: { flex: 1, borderWidth: 1, borderColor: ACCENT, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  backBtnText: { color: ACCENT, fontWeight: '700', fontSize: 14 },
  nextBtn: { flex: 2, backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  nextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  optionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  optionText: { fontSize: 14, color: '#000' },

  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  overlayText: { color: '#FFF', marginTop: 14, fontSize: 14, fontWeight: '600' },
});
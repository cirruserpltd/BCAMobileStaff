import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';

const ACCENT = '#2D5BFF';

type KV = { label: string; value: string | number | null | undefined };
type Table = { columns: { key: string; label: string }[]; rows: Record<string, any>[] };
type VisitSection = { title: string; total?: number | null; rows: { name: string; qty?: any; value?: any }[] };
type LoanAppraisal = {
  limit?: number;
  summary: KV[];
  sections: VisitSection[];
  guarantors: { name: string; id_no: string; phone: string; amount: any }[];
};

type Profile = {
  id: string;
  name: string;
  id_no: string;
  status: 'Active' | 'Declined' | 'Pending BM Approval' | 'Pending HQ Approval';
  income_badges: string[];
  can_approve_bm: boolean;
  can_approve_hq: boolean;
  personal: KV[];
  residential: KV[];
  next_of_kin: KV[];
  dependants: { name: string; age: any }[];
  income: { business: KV[]; employment: KV[]; farm: KV[] };
  appraisal_status: { micro: number; agribiz: number; group: number };
  micro: {
    business_types: Table; perishable_stock: Table; non_perishable_stock: Table;
    business_assets: Table; chattels: Table; guarantors: Table;
    business_checks: KV[]; home_checks: KV[]; agreement_checks: KV[];
  };
  agribiz: LoanAppraisal | null;
  group: LoanAppraisal | null;
  files: { name: string; url: string; date: string }[];
};

const STATUS_BTN: Record<string, { bg: string; label: string }> = {
  'Pending BM Approval': { bg: '#F57C00', label: 'Pending BM Approval' },
  'Pending HQ Approval': { bg: '#E65100', label: 'Pending HQ Approval' },
  'Active': { bg: '#388E3C', label: 'Active' },
  'Declined': { bg: '#C62828', label: 'Declined' },
};

const CHIP: Record<number, { bg: string; fg: string; label: string }> = {
  1: { bg: '#FFF3E0', fg: '#E65100', label: 'BM Pending' },
  2: { bg: '#FFF3E0', fg: '#E65100', label: 'HQ Pending' },
  3: { bg: '#E8F5E9', fg: '#388E3C', label: 'Approved' },
  4: { bg: '#FFEBEE', fg: '#C62828', label: 'Incomplete' },
};
const CHIP_NONE = { bg: '#F0F0F0', fg: '#777', label: 'Not Started' };

const fmt = (v: any) => (v === null || v === undefined || v === '' ? '-' : String(v));
const money = (v: any) => (v || v === 0 ? `KES ${Number(v).toLocaleString()}` : '-');

function Section({ icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={16} color={ACCENT} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Fields({ items }: { items: KV[] }) {
  return (
    <View style={styles.grid}>
      {items.map((f, i) => (
        <View key={i} style={styles.field}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <Text style={styles.fieldValue}>{fmt(f.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function SubTitle({ text }: { text: string }) {
  return <Text style={styles.subTitle}>{text}</Text>;
}

function MiniTable({ title, table }: { title: string; table: Table }) {
  return (
    <View style={{ marginTop: 12 }}>
      <SubTitle text={title} />
      {table.rows.length === 0 ? (
        <Text style={styles.empty}>None recorded.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.tRow, styles.tHead]}>
              {table.columns.map((c) => (
                <Text key={c.key} style={[styles.tCell, styles.tHeadText]}>{c.label}</Text>
              ))}
            </View>
            {table.rows.map((r, i) => (
              <View key={i} style={styles.tRow}>
                {table.columns.map((c) => (
                  <Text key={c.key} style={styles.tCell} numberOfLines={2}>{fmt(r[c.key])}</Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function LoanAppraisalView({ data, emptyText }: { data: LoanAppraisal | null; emptyText: string }) {
  if (!data) return <Text style={styles.empty}>{emptyText}</Text>;
  return (
    <>
      {!!data.limit && (
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Approved Loan Limit</Text>
          <Text style={styles.kpiValue}>{money(data.limit)}</Text>
        </View>
      )}
      <Fields items={data.summary} />
      {data.sections.map((s, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          <SubTitle text={`${s.title}${s.total != null ? `  (Total: ${money(s.total)})` : ''}`} />
          {s.rows.length === 0 ? (
            <Text style={styles.empty}>None recorded.</Text>
          ) : (
            s.rows.map((r, j) => (
              <View key={j} style={styles.listRow}>
                <Text style={styles.listName} numberOfLines={1}>{fmt(r.name)}</Text>
                {r.qty != null && <Text style={styles.listQty}>x{r.qty}</Text>}
                <Text style={styles.listValue}>{money(r.value)}</Text>
              </View>
            ))
          )}
        </View>
      ))}
      <MiniTable
        title="Guarantors"
        table={{
          columns: [
            { key: 'name', label: 'Name' }, { key: 'id_no', label: 'ID No' },
            { key: 'phone', label: 'Phone' }, { key: 'amount', label: 'Amount' },
          ],
          rows: data.guarantors,
        }}
      />
    </>
  );
}

export default function MemberDetailsScreen() {
  const { authFetch } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'micro' | 'agribiz' | 'group'>('micro');

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch(`/api/mobile/staff/members/individual/${id}/profile`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load member');
      setData(json.payload);
    } catch (e: any) {
      setError(e?.message || 'Failed to load member');
    }
  }, [authFetch, id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const runApproval = async (kind: 'bm' | 'hq') => {
    try {
      setActing(true);
      const res = await authFetch(`/api/mobile/staff/members/individual/${id}/${kind}-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Approval failed');
      Alert.alert('Success', json.message || 'Approved');
      await load(); // status, button label and chips all refresh from the server
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Approval failed');
    } finally {
      setActing(false);
    }
  };

  const onStatusPress = () => {
    if (!data) return;
    if (data.status === 'Pending BM Approval') {
      if (!data.can_approve_bm) return Alert.alert('Not allowed', 'Only a BM of this member\'s branch can approve.');
      Alert.alert('BM Approval', `Approve ${data.name} as Branch Manager?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => runApproval('bm') },
      ]);
    } else if (data.status === 'Pending HQ Approval') {
      if (!data.can_approve_hq) return Alert.alert('Not allowed', 'Only designated HQ staff can approve.');
      Alert.alert('HQ Approval', `Approve ${data.name} at HQ?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => runApproval('hq') },
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={ACCENT} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.error}>{error || 'Member not found'}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const btn = STATUS_BTN[data.status] || { bg: '#777', label: data.status };
  const actionable = data.status === 'Pending BM Approval' || data.status === 'Pending HQ Approval';
  const st = data.appraisal_status;

  const tabs: { key: 'micro' | 'agribiz' | 'group'; label: string; status: number }[] = [
    { key: 'micro', label: 'Micro Loan', status: st.micro },
    { key: 'agribiz', label: 'Agribiz', status: st.agribiz },
    { key: 'group', label: 'Group Loan', status: st.group },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={ACCENT} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.name} numberOfLines={1}>{data.name}</Text>
          <Text style={styles.sub}>ID: {data.id_no}</Text>
        </View>
        <TouchableOpacity
          style={[styles.statusBtn, { backgroundColor: btn.bg }, (!actionable || acting) && { opacity: actionable ? 0.6 : 0.9 }]}
          disabled={!actionable || acting}
          onPress={onStatusPress}
        >
          {acting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.statusBtnText}>{btn.label}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />}
      >
        {data.income_badges.length > 0 && (
          <View style={styles.badgeRow}>
            {data.income_badges.map((b) => (
              <View key={b} style={styles.badge}><Text style={styles.badgeText}>{b}</Text></View>
            ))}
          </View>
        )}

        <Text style={styles.groupTitle}>Member Data</Text>

        <Section icon="person-outline" title="Personal information">
          <Fields items={data.personal} />
        </Section>

        <Section icon="home-outline" title="Residential information">
          <Fields items={data.residential} />
        </Section>

        <Section icon="people-outline" title="Dependants & next of kin">
          <SubTitle text="Next of kin" />
          <Fields items={data.next_of_kin} />
          <SubTitle text="Dependants" />
          {data.dependants.length === 0 ? (
            <Text style={styles.empty}>No dependants</Text>
          ) : (
            data.dependants.map((d, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listName}>{fmt(d.name)}</Text>
                <Text style={styles.listValue}>{fmt(d.age)} yrs</Text>
              </View>
            ))
          )}
        </Section>

        <Section icon="briefcase-outline" title="Source of income">
          <SubTitle text="Business income" />
          <Fields items={data.income.business} />
          <SubTitle text="Employment income" />
          <Fields items={data.income.employment} />
          <SubTitle text="Agribiz / farm details" />
          <Fields items={data.income.farm} />
        </Section>

        <Text style={styles.groupTitle}>Appraisal Data & Assessments</Text>

        <View style={styles.tabs}>
          {tabs.map((t) => {
            const chip = CHIP[t.status] || CHIP_NONE;
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                  <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          {tab === 'micro' && (
            <>
              <SubTitle text="Business information" />
              <MiniTable title="Business type and size" table={data.micro.business_types} />
              <MiniTable title="Perishable stock" table={data.micro.perishable_stock} />
              <MiniTable title="Non-perishable stock" table={data.micro.non_perishable_stock} />
              <MiniTable title="Business assets" table={data.micro.business_assets} />
              <SubTitle text="Business checks" />
              <Fields items={data.micro.business_checks} />
              <SubTitle text="Home information" />
              <MiniTable title="Chattels (pledged household items)" table={data.micro.chattels} />
              <Fields items={data.micro.home_checks} />
              <SubTitle text="Agreement information" />
              <Fields items={data.micro.agreement_checks} />
              <SubTitle text="Guarantor information" />
              <MiniTable title="Loan guarantor declaration" table={data.micro.guarantors} />
            </>
          )}
          {tab === 'agribiz' && (
            <LoanAppraisalView data={data.agribiz} emptyText="No Agribiz appraisal recorded." />
          )}
          {tab === 'group' && (
            <LoanAppraisalView data={data.group} emptyText="No Group Loan appraisal recorded." />
          )}
        </View>

        <Text style={styles.groupTitle}>Files</Text>
        <View style={styles.card}>
          {data.files.length === 0 ? (
            <Text style={styles.empty}>No attachments.</Text>
          ) : (
            data.files.map((f, i) => (
              <TouchableOpacity key={i} style={styles.fileRow} onPress={() => Linking.openURL(f.url)}>
                <Ionicons name="document-outline" size={20} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.fileName}>{f.name}</Text>
                  <Text style={styles.fileMeta}>Uploaded: {f.date}</Text>
                </View>
                <Text style={styles.fileView}>View</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  name: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  sub: { fontSize: 11, color: '#888', marginTop: 2 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, minWidth: 90, alignItems: 'center' },
  statusBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  badge: { backgroundColor: '#E3F2FD', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, color: ACCENT, fontWeight: '600' },

  groupTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D32', marginTop: 10, marginBottom: 8, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  subTitle: { fontSize: 12, fontWeight: '700', color: '#444', marginTop: 12, marginBottom: 6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', paddingRight: 8, marginBottom: 10 },
  fieldLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase', marginBottom: 2 },
  fieldValue: { fontSize: 13, color: '#222', fontWeight: '500' },
  empty: { fontSize: 12, color: '#999', fontStyle: 'italic', marginVertical: 6 },

  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F3F3' },
  tHead: { backgroundColor: '#FAFAFA' },
  tCell: { width: 110, paddingVertical: 8, paddingHorizontal: 6, fontSize: 12, color: '#333' },
  tHeadText: { fontWeight: '700', fontSize: 10, color: '#666', textTransform: 'uppercase' },

  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  listName: { flex: 1, fontSize: 12, color: '#333' },
  listQty: { fontSize: 11, color: '#888', marginHorizontal: 8 },
  listValue: { fontSize: 12, fontWeight: '600', color: '#222' },

  tabs: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  tabActive: { borderColor: ACCENT, backgroundColor: '#F0F4FF' },
  tabText: { fontSize: 11, fontWeight: '600', color: '#666', marginBottom: 4 },
  tabTextActive: { color: ACCENT },
  chip: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 9, fontWeight: '700' },

  kpi: { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12, marginBottom: 12 },
  kpiLabel: { fontSize: 11, color: '#2E7D32' },
  kpiValue: { fontSize: 20, fontWeight: '700', color: '#1B5E20', marginTop: 2 },

  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  fileName: { fontSize: 13, fontWeight: '600', color: '#222' },
  fileMeta: { fontSize: 11, color: '#999', marginTop: 2 },
  fileView: { fontSize: 12, color: ACCENT, fontWeight: '600', textDecorationLine: 'underline' },

  error: { textAlign: 'center', color: 'red', marginTop: 60, paddingHorizontal: 20 },
  retry: { alignSelf: 'center', marginTop: 16, backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 6 },
  retryText: { color: '#fff', fontWeight: '600' },
});
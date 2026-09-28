import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, Image, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';

const ACCENT = '#2D5BFF';

type Overview = {
  id: string; name: string; id_no: string; phone: string; alt_phone?: string | null;
  photo?: string | null;
  status: string; can_approve_bm: boolean; can_approve_hq: boolean;
  missing_details: boolean; affordability: number | null;
  branch: string; team: string; current_product?: string | null;
  af_wallet: number | null; cash_collateral: number | null; loan_status: string;
  can_use_collateral?: boolean;
  loan_summary: {
    no_of_loans: number; loan_limit: number | null; loan_principal: number | null;
    due_date: string; repayable: number | null; paid: number | null;
    balance: number | null; due_today: number | null;
  };
  schedule: { date: string; loan: any; amount: any; paid: any; balance: any; status: any }[];
  loans: {
    id: any; number: any; status: any; product?: string | null; amount: number | null;
    balance: number | null; disbursed_at: string; due_date: string;
  }[];
  disbursements: { id: any; date: string; amount: number | null; loan: any; ref: any }[];
  payments: { id: any; date: string; amount: number | null; type: string }[];
  approver: { id: string; name: string } | null;
};

const STATUS_BTN: Record<string, string> = {
  'Pending BM Approval': '#F57C00',
  'Pending HQ Approval': '#E65100',
  'Active': '#388E3C',
  'Declined': '#C62828',
};

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? '-' : `KES ${Number(v).toLocaleString()}`;
const dash = (v: any) => (v === null || v === undefined || v === '' ? '-' : String(v));

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toDmy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

type TabKey = 'schedule' | 'loans' | 'disbursements' | 'payments';

function InfoCard({ icon, label, value, right }: { icon: any; label: string; value: string; right?: React.ReactNode }) {
  return (
    <View style={styles.infoCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      {right}
      <View style={styles.infoIcon}><Ionicons name={icon} size={16} color="#fff" /></View>
    </View>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Pill({ icon, label, onPress, filled, bg }: { icon: any; label: string; onPress: () => void; filled?: boolean; bg?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, filled ? { backgroundColor: bg || ACCENT, borderColor: bg || ACCENT } : null]}
    >
      <Ionicons name={icon} size={13} color={filled ? '#fff' : ACCENT} />
      <Text style={[styles.pillText, filled ? { color: '#fff' } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function IndividualProfileScreen() {
  const { authFetch } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAf, setShowAf] = useState(false);
  const [tab, setTab] = useState<TabKey>('schedule');
  const [approvalStage, setApprovalStage] = useState<'bm' | 'hq' | null>(null);
  const [approvalDate, setApprovalDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch(`/api/mobile/staff/members/individual/${id}/overview`);
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
      body: JSON.stringify(kind === 'hq' ? { date: toYmd(approvalDate) } : {}),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Approval failed');
    setApprovalStage(null);
    Alert.alert('Success', json.message || 'Approved');
    await load();
  } catch (e: any) {
    Alert.alert('Error', e?.message || 'Approval failed');
  } finally {
    setActing(false);
  }
};

const runDecline = async () => {
  try {
    setActing(true);
    const res = await authFetch(`/api/mobile/staff/members/individual/${id}/decline-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: toYmd(approvalDate) }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Decline failed');
    setApprovalStage(null);
    Alert.alert('Done', json.message || 'Member declined');
    await load();
  } catch (e: any) {
    Alert.alert('Error', e?.message || 'Decline failed');
  } finally {
    setActing(false);
  }
};

const confirmDecline = () => {
  if (!data) return;
  Alert.alert('Decline member', `Decline / blacklist ${data.name}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Decline', style: 'destructive', onPress: runDecline },
  ]);
};

const onStatusPress = () => {
  if (!data) return;
  if (data.status === 'Pending BM Approval') {
    if (!data.can_approve_bm) return Alert.alert('Not allowed', "Only a BM of this member's branch can perform this action.");
    setApprovalStage('bm');
  } else if (data.status === 'Pending HQ Approval') {
    if (!data.can_approve_hq) return Alert.alert('Not allowed', 'Only designated HQ staff can perform this action.');
    setApprovalDate(new Date());
    setApprovalStage('hq');
  }
};

  const openDetails = () => router.push({ pathname: '/members/memberDetails', params: { id: String(id) } } as any);
  const notWired = (name: string) => () => Alert.alert(name, 'This action is not available in the app yet.');

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

  const ls = data.loan_summary;
  const actionable = data.status === 'Pending BM Approval' || data.status === 'Pending HQ Approval';
  const btnBg = STATUS_BTN[data.status] || '#777';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'schedule', label: 'Schedule' },
    { key: 'loans', label: 'Loans' },
    { key: 'disbursements', label: 'Disbursements' },
    { key: 'payments', label: 'Payments' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={ACCENT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Member Profile</Text>
        <TouchableOpacity
          style={[styles.statusBtn, { backgroundColor: btnBg }, (!actionable || acting) && { opacity: actionable ? 0.6 : 0.9 }]}
          disabled={!actionable || acting}
          onPress={onStatusPress}
        >
          {acting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.statusBtnText}>{data.status}</Text>}
        </TouchableOpacity>
      </View>

      {data.status === 'Active' && (
        <View style={styles.actionBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionBarRow}>
            <Pill filled bg="#1B8A3A" icon="calculator-outline" label="Receive payments" onPress={notWired('Receive payments')} />
            {data.can_use_collateral && (
              <Pill filled bg="#43A047" icon="flash-outline" label="Use collateral" onPress={notWired('Use collateral')} />
            )}
            <Pill filled bg="#F9A825" icon="create-outline" label="Appraisals" onPress={notWired('Appraisals')} />
            <Pill filled bg="#039BE5" icon="phone-portrait-outline" label="STK-Push" onPress={notWired('STK-Push')} />
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />}
      >
        {/* Name + affordability */}
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            {data.photo ? (
              <Image source={{ uri: data.photo }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={30} color="#bbb" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{data.name}</Text>
            <Text style={styles.idNo}>{data.id_no}</Text>
          </View>
          <View style={styles.affBox}>
            {data.affordability ? (
              <>
                <Text style={styles.affLabel}>Affordability limit</Text>
                <Text style={styles.affValue}>{money(data.affordability)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.affLabel}>No affordability data!</Text>
                <TouchableOpacity onPress={openDetails}><Text style={styles.affLink}>Add data</Text></TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {data.missing_details && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Some of the member details are missing. This may affect some features in the system.</Text>
            <TouchableOpacity onPress={openDetails}><Text style={styles.bannerLink}>Finish adding all details</Text></TouchableOpacity>
          </View>
        )}

        {/* Info cards */}
        <View style={styles.infoGrid}>
          <InfoCard icon="business" label="Branch" value={dash(data.branch)} />
          <InfoCard
            icon="wallet-outline"
            label="AF Wallet"
            value={showAf ? money(data.af_wallet) : 'KES ********'}
            right={
              <TouchableOpacity onPress={() => setShowAf(!showAf)} hitSlop={8} style={{ marginRight: 6 }}>
                <Ionicons name={showAf ? 'eye-off' : 'eye'} size={16} color="#666" />
              </TouchableOpacity>
            }
          />
          <InfoCard icon="cash-outline" label="Cash collateral" value={money(data.cash_collateral)} />
          <InfoCard icon="remove" label="Loan status" value={data.loan_status} />
        </View>

        {/* Top pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          <Pill icon="refresh-outline" label="Reassess" onPress={notWired('Reassess')} />
          <Pill icon="document-text-outline" label="Notes" onPress={notWired('Notes')} />
          <Pill icon="information-circle-outline" label="Details" onPress={openDetails} />
        </ScrollView>

        {/* Personal card */}
        <View style={styles.card}>
          <Line label="Name" value={dash(data.name)} />
          <Line label="ID No" value={dash(data.id_no)} />
          <Line label="Phone" value={dash(data.phone)} />
          <Line label="Alt phone" value={dash(data.alt_phone)} />
          <Line label="Team" value={dash(data.team)} />
          <Line label="Current product" value={data.current_product || 'Not set'} color={data.current_product ? undefined : ACCENT} />
        </View>

        {/* Loan summary */}
        <View style={styles.card}>
          <Line label="No of loans" value={String(ls.no_of_loans)} />
          <Line label="Cash collateral" value={money(data.cash_collateral)} />
          <Line label="Loan limit" value={money(ls.loan_limit)} />
          <Line label="Loan principal" value={money(ls.loan_principal)} />
          <Line label="Loan due date" value={dash(ls.due_date)} />
        </View>

        <View style={styles.card}>
          <Line label="Repayable amount" value={money(ls.repayable)} />
          <Line label="Total paid" value={money(ls.paid)} color="#388E3C" />
          <Line label="Total balance" value={money(ls.balance)} color={ls.balance ? '#E64A19' : undefined} />
          <Line label="Balance due today" value={money(ls.due_today)} />
        </View>

        {/* Action pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          <Pill filled icon="location-outline" label="Location" onPress={notWired('Location')} />
          <Pill filled bg="#2E7D32" icon="stats-chart-outline" label="P.A.R (0%)" onPress={notWired('P.A.R')} />
          <Pill filled icon="trending-up-outline" label="Change Loan Limit" onPress={notWired('Change Loan Limit')} />
          <Pill filled icon="add-circle-outline" label="Issue credit" onPress={notWired('Issue credit')} />
          <Pill filled icon="remove-circle-outline" label="Issue debit" onPress={notWired('Issue debit')} />
          <Pill filled icon="sync-outline" label="Recovery" onPress={notWired('Recovery')} />
          <Pill filled icon="mail-outline" label="Demand letter" onPress={notWired('Demand letter')} />
        </ScrollView>

        {/* Tabs */}
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          {tab === 'schedule' && (
            <>
              <Text style={styles.sectionTitle}>Consolidated Installment Schedule</Text>
              {data.schedule.length === 0 ? (
                <Text style={styles.empty}>
                  {data.loans.length === 0 ? "Member doesn't have any loans." : 'No schedule available.'}
                </Text>
              ) : (
                data.schedule.map((r, i) => (
                  <View key={i} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{dash(r.date)}</Text>
                      <Text style={styles.rowSub}>Loan {dash(r.loan)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.rowTitle}>{money(r.amount)}</Text>
                      <Text style={styles.rowSub}>Bal {money(r.balance)}</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'loans' &&
            (data.loans.length === 0 ? (
              <Text style={styles.empty}>No loans.</Text>
            ) : (
              data.loans.map((l, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Loan {dash(l.number)}</Text>
                    <Text style={styles.rowSub}>{dash(l.product)} · Disbursed {dash(l.disbursed_at)}</Text>
                    <Text style={styles.rowSub}>Due {dash(l.due_date)} · {dash(l.status)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rowTitle}>{money(l.amount)}</Text>
                    <Text style={styles.rowSub}>Bal {money(l.balance)}</Text>
                  </View>
                </View>
              ))
            ))}

          {tab === 'disbursements' &&
            (data.disbursements.length === 0 ? (
              <Text style={styles.empty}>No disbursements.</Text>
            ) : (
              data.disbursements.map((d, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{dash(d.date)}</Text>
                    <Text style={styles.rowSub}>Loan {dash(d.loan)} · Ref {dash(d.ref)}</Text>
                  </View>
                  <Text style={styles.rowTitle}>{money(d.amount)}</Text>
                </View>
              ))
            ))}

          {tab === 'payments' &&
            (data.payments.length === 0 ? (
              <Text style={styles.empty}>No payments.</Text>
            ) : (
              data.payments.map((p, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{p.type}</Text>
                    <Text style={styles.rowSub}>{dash(p.date)}</Text>
                  </View>
                  <Text style={styles.rowTitle}>{money(p.amount)}</Text>
                </View>
              ))
            ))}
        </View>
      </ScrollView>
      <Modal
        visible={approvalStage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!acting) {
            setShowDatePicker(false);
            setApprovalStage(null);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {approvalStage === 'hq' ? 'Individual member HQ Approval' : 'Individual member BM Approval'}
            </Text>
            <Text style={styles.modalNote}>
              {approvalStage === 'hq'
                ? 'Only designated HQ staff can perform this action'
                : "Only BM staff of this member's branch can perform this action"}
            </Text>

            {approvalStage === 'hq' ? (
              <>
                <Text style={styles.modalLabel}>Approval date</Text>
                <TouchableOpacity
                  style={styles.modalField}
                  onPress={() => setShowDatePicker(true)}
                  disabled={acting}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.modalFieldText}>{toDmy(approvalDate)}</Text>
                    <Ionicons name="calendar-outline" size={18} color={ACCENT} />
                  </View>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={approvalDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    maximumDate={new Date()}
                    onChange={(e, d) => {
                      setShowDatePicker(false);
                      if (e.type !== 'dismissed' && d) setApprovalDate(d);
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.modalLabel}>Member</Text>
                <View style={styles.modalField}>
                  <Text style={styles.modalFieldText}>{data.name}</Text>
                </View>
              </>
            )}

            <Text style={styles.modalLabel}>Approved by</Text>
            <View style={styles.modalField}>
              <Text style={styles.modalFieldText}>{data.approver?.name || '-'}</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: ACCENT }, acting && { opacity: 0.6 }]}
                disabled={acting}
                onPress={() => approvalStage && runApproval(approvalStage)}
              >
                {acting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.modalBtnText}>Approve Member</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E53935' }, acting && { opacity: 0.6 }]}
                disabled={acting}
                onPress={confirmDecline}
              >
                <Ionicons name="close-circle-outline" size={16} color="#fff" />
                <Text style={styles.modalBtnText}>Decline member</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalClose}
              disabled={acting}
              onPress={() => {
                setShowDatePicker(false);
                setApprovalStage(null);
              }}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  headerTitle: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: 'bold', color: '#000' },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, minWidth: 90, alignItems: 'center' },
  statusBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#EEE',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 56, height: 56 },
  name: { fontSize: 18, fontWeight: '800', color: '#111' },
  idNo: { fontSize: 13, color: '#777', marginTop: 2 },
  affBox: { backgroundColor: '#fff', borderRadius: 8, padding: 8, maxWidth: 130 },
  affLabel: { fontSize: 10, color: '#666', fontStyle: 'italic' },
  affValue: { fontSize: 13, fontWeight: '700', color: '#222', marginTop: 2 },
  affLink: { fontSize: 11, color: ACCENT, fontWeight: '700', marginTop: 4 },

  banner: { backgroundColor: '#E1F3FF', borderColor: ACCENT, borderWidth: 1, borderRadius: 6, padding: 10, marginBottom: 10 },
  bannerText: { fontSize: 12, color: ACCENT },
  bannerLink: { fontSize: 12, color: ACCENT, fontWeight: '700', textDecorationLine: 'underline', marginTop: 4 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  infoCard: {
    width: '48.5%', backgroundColor: '#fff', borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  infoLabel: { fontSize: 11, color: '#777', marginTop: 2 },
  infoIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },

  pillRow: { gap: 8, paddingVertical: 6, marginBottom: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1.5, borderColor: ACCENT, backgroundColor: '#fff',
  },
  pillText: { fontSize: 12, fontWeight: '700', color: ACCENT },

  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  lineLabel: { fontSize: 12, color: '#666' },
  lineValue: { fontSize: 13, fontWeight: '600', color: '#222', flexShrink: 1, textAlign: 'right' },

  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 8, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#F0F4FF' },
  tabText: { fontSize: 11, color: '#666', fontWeight: '600' },
  tabTextActive: { color: ACCENT },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 12 },
  empty: { fontSize: 13, color: '#777', textAlign: 'center', paddingVertical: 24 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F3F3' },
  rowTitle: { fontSize: 13, fontWeight: '600', color: '#222' },
  rowSub: { fontSize: 11, color: '#888', marginTop: 2 },

  error: { textAlign: 'center', color: 'red', marginTop: 60, paddingHorizontal: 20 },
  retry: { alignSelf: 'center', marginTop: 16, backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 6 },
  retryText: { color: '#fff', fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
modalTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
modalNote: { fontSize: 12, color: '#666', marginTop: 6, marginBottom: 14 },
modalLabel: { fontSize: 12, color: '#666', marginBottom: 4, marginTop: 6 },
modalField: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F8F8F8' },
modalFieldText: { fontSize: 14, color: '#222' },
modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
modalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8 },
modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
modalClose: { alignItems: 'center', paddingTop: 14 },
modalCloseText: { color: '#666', fontSize: 13, fontWeight: '600' },
actionBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
actionBarRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
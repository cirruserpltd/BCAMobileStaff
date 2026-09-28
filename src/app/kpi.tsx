import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';

const BLUE = '#4285F4';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type MonthKpi = {
  total_loans_value_target?: number;
  total_actual_disbursed?: number;
  disbursement_percentage?: number;
  disbursement_variance?: number;
  expected_mtd?: number;
  paid_mtd?: number;
  percentage?: number;
  variance?: number;
};

type MonthRow = { month: string; year: number | string; kpi: MonthKpi };

type Tab = 'monthly' | 'live';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n?: number | null) =>
  typeof n === 'number' ? n.toLocaleString('en-KE', { minimumFractionDigits: 2 }) : '–';

const pct = (n?: number | null) => (typeof n === 'number' && !isNaN(n) ? `${n.toFixed(1)}%` : '–');

const rateColor = (n?: number | null) => {
  if (typeof n !== 'number' || isNaN(n)) return '#999';
  if (n >= 98) return '#4CAF50';
  if (n >= 95) return '#F57C00';
  return '#D32F2F';
};

const toQuery = (obj: Record<string, string>) =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function KpiReportScreen() {
  const { authFetch } = useAuth();
  const { queryParams } = useViewPreference();

  const [tab, setTab] = useState<Tab>('monthly');
  const [memberType, setMemberType] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null); // 0-indexed in UI

  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Period modal
  const now = new Date();
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i);
  const [showModal, setShowModal] = useState(false);
  const [tempYear, setTempYear] = useState<number | null>(null);
  const [tempMonth, setTempMonth] = useState<number | null>(null);

  useEffect(() => {
    setYear(null);
    setMonth(null);
  }, [tab]);

  const fetchJson = useCallback(
    async (path: string) => {
      const res = await authFetch(path);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Expected JSON from ${path} but got ${res.status}`);
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Request failed: ${path}`);
      return data;
    },
    [authFetch]
  );

  const fetchReport = useCallback(async () => {
    try {
      setError(null);
      const filters: Record<string, string> = {
        months: '6',
        ...(memberType ? { member_type: memberType } : {}),
        ...(year !== null ? { year: String(year) } : {}),
        ...(month !== null ? { month: String(month + 1) } : {}),
      };
      const path = tab === 'monthly' ? '/monthly' : '/live';
      const result = await fetchJson(
        `/api/mobile/staff/dashboard/kpi${path}?${toQuery(filters)}${queryParams}`
      );
      setRows(result.payload?.data ?? []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Failed to load KPI data');
    } finally {
      setLoading(false);
    }
  }, [fetchJson, tab, memberType, year, month, queryParams]);

  useEffect(() => {
    setLoading(true);
    fetchReport();
  }, [fetchReport]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReport();
    setRefreshing(false);
  };

  /* ---------------- handlers ---------------- */

  const openModal = () => {
    setTempYear(year);
    setTempMonth(month);
    setShowModal(true);
  };

  const applyPeriod = () => {
    setYear(tempYear);
    setMonth(tempMonth);
    setShowModal(false);
  };

  const pickMonth = (i: number) => {
    if (tempMonth === i) return setTempMonth(null);
    setTempMonth(i);
    if (tempYear === null) setTempYear(now.getFullYear());
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/actions' as any));

  const hasPeriod = year !== null;
  const periodLabel =
    year === null ? '' : month === null ? `All of ${year}` : `${MONTHS[month]} ${year}`;

  /* ---------------- render pieces ---------------- */

  const MonthCard = ({ row }: { row: MonthRow }) => {
    const k = row.kpi || {};
    const key = `${row.month}-${row.year}`;
    const open = expanded === key;
    const disbColor = rateColor(k.disbursement_percentage);
    const collColor = rateColor(k.percentage);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => setExpanded(open ? null : key)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardMonth}>
            {row.month} {row.year}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
        </View>

        <View style={styles.rateRow}>
          <View style={styles.rateBlock}>
            <Text style={styles.rateBlockLabel}>Disbursement</Text>
            <Text style={[styles.rateBlockValue, { color: disbColor }]}>
              {pct(k.disbursement_percentage)}
            </Text>
          </View>
          <View style={styles.rateBlock}>
            <Text style={styles.rateBlockLabel}>Collection</Text>
            <Text style={[styles.rateBlockValue, { color: collColor }]}>{pct(k.percentage)}</Text>
          </View>
        </View>

        {open && (
          <View style={styles.details}>
            <Text style={styles.sectionHeading}>Disbursements</Text>
            <DetailRow label="Target (MTD)" value={fmt(k.total_loans_value_target)} />
            <DetailRow label="Disbursed (MTD)" value={fmt(k.total_actual_disbursed)} />
            <DetailRow label="Variance" value={fmt(k.disbursement_variance)} />

            <Text style={[styles.sectionHeading, { marginTop: 10 }]}>Collections</Text>
            <DetailRow label="Expected (DTD)" value={fmt(k.expected_mtd)} />
            <DetailRow label="Received (DTD)" value={fmt(k.paid_mtd)} />
            <DetailRow label="Variance" value={fmt(k.variance)} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const empty = (
    <View style={styles.emptyContainer}>
      {loading ? (
        <>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading KPI data...</Text>
        </>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <Text style={styles.emptyText}>No KPI data for this period</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KPI Report</Text>
      </View>

      <View style={styles.tabRow}>
        {(['monthly', 'live'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabButton, tab === t && styles.tabButtonActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabButtonText, tab === t && styles.tabButtonTextActive]}>
              {t === 'monthly' ? 'Monthly' : 'Live (MTD)'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.periodButton} onPress={openModal}>
          <Ionicons name="calendar-outline" size={18} color={BLUE} />
          {hasPeriod && <View style={styles.periodActiveDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {[
          { key: null, label: 'All members' },
          { key: 'individual', label: 'Individual' },
          { key: 'group', label: 'Group' },
        ].map((c) => {
          const active = memberType === c.key;
          return (
            <TouchableOpacity
              key={c.label}
              style={[styles.typeChip, active && styles.typeChipActive]}
              onPress={() => setMemberType(c.key)}
            >
              <Text style={[styles.typeChipText, active && { color: 'white' }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {hasPeriod && (
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Ionicons name="calendar" size={13} color={BLUE} style={{ marginRight: 4 }} />
            <Text style={styles.pillText}>{periodLabel}</Text>
            <TouchableOpacity
              onPress={() => {
                setYear(null);
                setMonth(null);
              }}
              style={styles.pillClearBtn}
            >
              <Text style={styles.pillClearText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BLUE]} tintColor={BLUE} />}
      >
        {loading ? (
          empty
        ) : rows.length === 0 ? (
          empty
        ) : (
          rows.map((row) => <MonthCard key={`${row.month}-${row.year}`} row={row} />)
        )}
      </ScrollView>

      {/* Period modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Period</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Year</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
              {years.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearChip, tempYear === y && styles.yearChipActive]}
                  onPress={() => {
                    if (tempYear === y) {
                      setTempYear(null);
                      setTempMonth(null);
                    } else setTempYear(y);
                  }}
                >
                  <Text style={[styles.yearChipText, tempYear === y && { color: BLUE }]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>Month</Text>
            <View style={styles.monthGrid}>
              {MONTHS.map((m, i) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.monthChip, tempMonth === i && styles.monthChipActive]}
                  onPress={() => pickMonth(i)}
                >
                  <Text style={[styles.monthChipText, tempMonth === i && { color: 'white' }]}>{m.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                  setTempYear(null);
                  setTempMonth(null);
                }}
              >
                <Text style={styles.resetBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyPeriod}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 50,
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: 'white' },

  tabRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tabButtonActive: { backgroundColor: BLUE, borderColor: BLUE },
  tabButtonText: { fontSize: 13, fontWeight: '600', color: '#555' },
  tabButtonTextActive: { color: 'white' },
  periodButton: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodActiveDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },

  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#555' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: BLUE },
  pillClearBtn: { marginLeft: 8, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pillClearText: { fontSize: 11, color: 'white', fontWeight: '600' },

  listContent: { padding: 16, paddingTop: 8, paddingBottom: 24 },

  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardMonth: { fontSize: 15, fontWeight: '700', color: '#333' },
  rateRow: { flexDirection: 'row', gap: 12 },
  rateBlock: { flex: 1, backgroundColor: '#FAFAFA', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  rateBlockLabel: { fontSize: 11, color: '#777', marginBottom: 4 },
  rateBlockValue: { fontSize: 18, fontWeight: '700' },

  details: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 12, color: '#777' },
  detailValue: { fontSize: 12, color: '#222', fontWeight: '600' },

  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyText: { fontSize: 14, color: '#666' },
  errorText: { fontSize: 14, color: 'red', paddingHorizontal: 20, textAlign: 'center' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380, elevation: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  yearChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  yearChipActive: { backgroundColor: '#E8F0FE', borderColor: BLUE },
  yearChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  monthChip: {
    width: '22%',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  monthChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  monthChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  modalActions: { flexDirection: 'row', gap: 10 },
  resetBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: '#F0F0F0', alignItems: 'center' },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#555' },
  applyBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: BLUE, alignItems: 'center' },
  applyBtnText: { fontSize: 14, fontWeight: '600', color: 'white' },
});
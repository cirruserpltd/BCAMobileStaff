import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';

const BLUE = '#4285F4';
const PER_PAGE = 20;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Bucket = { total: number; amount: number };
type Summary = Record<string, Bucket | undefined>;

type Loan = {
  id: number;
  member_id?: number;
  client_id?: number;
  member_name?: string;
  branch?: { name?: string };
  product?: { name?: string };
  disbursed_at?: string | null;
  due_date?: string | null;
  amount: number;
  interest: number;
  charges: number;
  penalties: number;
  credit: number;
  debit: number;
  amount_repayable: number;
  amount_paid: number;
  balance: number;
  status: number;
};

type Totals = { total_balance?: number; total_paid?: number; total_principal?: number };

/* ------------------------------------------------------------------ */
/* Quick filters — mirror the web summary cards                        */
/* ------------------------------------------------------------------ */

type QuickKey = 'due7' | 'due3' | 'dueToday' | 'defYesterday' | 'defWeek' | 'defAll';

// Local-date yyyy-mm-dd (toISOString would shift the day in UTC+3)
const ymd = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const QUICK: Record<QuickKey, { label: string; summaryKey: string; build: () => Record<string, string> }> = {
  due7: {
    label: 'Due in 7 days',
    summaryKey: 'all_loans_due_in_7_days',
    build: () => ({ status: '3', due_date_from: ymd(0), due_date_to: ymd(7) }),
  },
  due3: {
    label: 'Due in 3 days',
    summaryKey: 'all_loans_due_in_3_days',
    build: () => ({ status: '3', due_date_from: ymd(0), due_date_to: ymd(3) }),
  },
  dueToday: {
    label: 'Due today',
    summaryKey: 'all_loans_due_today',
    build: () => ({ status: '3', due_date_from: ymd(0), due_date_to: ymd(0) }),
  },
  defYesterday: {
    label: 'Defaulted yesterday',
    summaryKey: 'all_loans_defaulted_yesterday',
    build: () => ({ status: '5', due_date_from: ymd(-1), due_date_to: ymd(-1) }),
  },
  defWeek: {
    label: 'Defaulted this week',
    summaryKey: 'all_loans_defaulted_this_week',
    build: () => ({ status: '5', due_date_from: ymd(-new Date().getDay()), due_date_to: ymd(-1) }),
  },
  defAll: {
    label: 'Total defaulted',
    summaryKey: 'all_defaulted_loans',
    build: () => ({ status: '5' }),
  },
};

const QUICK_ORDER: QuickKey[] = ['due7', 'due3', 'dueToday', 'defYesterday', 'defWeek', 'defAll'];
const isQuickKey = (v: unknown): v is QuickKey => typeof v === 'string' && v in QUICK;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n?: number | string | null) =>
  Number(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });

// Status codes follow the web report: 0 BM, 1 HQ, 2 disbursement, 3 active, 4 paid, 5 defaulted
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  '-2': { label: 'Closed', bg: '#ECEFF1', fg: '#607D8B' },
  '-1': { label: 'Rejected', bg: '#FFEBEE', fg: '#D32F2F' },
  '0': { label: 'Pending BM', bg: '#FFF8E1', fg: '#FBC02D' },
  '1': { label: 'Pending HQ', bg: '#E8EAF6', fg: '#b553ff' },
  '2': { label: 'Pending Disb.', bg: '#FFF3E0', fg: '#E65100' },
  '3': { label: 'Active', bg: '#E8F5E9', fg: '#4CAF50' },
  '4': { label: 'Paid', bg: '#E0F2F1', fg: '#00796B' },
  '5': { label: 'Defaulted', bg: '#FFEBEE', fg: '#D32F2F' },
};
const statusOf = (s: number) => STATUS[String(s)] ?? { label: 'Unknown', bg: '#ECEFF1', fg: '#607D8B' };

const shortName = (name?: string) => (name ? name.split(' ').slice(0, 2).join(' ') : 'N/A');
const fmtDate = (d?: string | null) => {
  if (!d) return 'PENDING';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString('en-KE');
};

// One search box -> the right backend filter
const searchToParam = (q: string): Record<string, string> | null => {
  const s = q.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    if (s.length >= 9) return { phone: s };
    if (s.length >= 7) return { id_no: s };
    return { loan_id: s };
  }
  return { member_name: s };
};

const disbursedRange = (year: number | null, month: number | null): Record<string, string> | null => {
  if (year === null) return null;
  if (month === null) return { disbursed_at_from: `${year}-01-01`, disbursed_at_to: `${year}-12-31` };
  const mm = String(month + 1).padStart(2, '0');
  const last = new Date(year, month + 1, 0).getDate();
  return { disbursed_at_from: `${year}-${mm}-01`, disbursed_at_to: `${year}-${mm}-${last}` };
};

const toQuery = (obj: Record<string, string>) =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function LoansReportScreen() {
  const { authFetch } = useAuth();
  const { queryParams } = useViewPreference();
  const params = useLocalSearchParams<{ quick?: string }>();

  const listRef = useRef<FlatList<Loan>>(null);
  const reqId = useRef(0); // guards against out-of-order responses

  // Filters. Page is always reset to 1 in the same handler that changes a filter.
  const [quick, setQuick] = useState<QuickKey | null>(isQuickKey(params.quick) ? params.quick : null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  // Data
  const [rows, setRows] = useState<Loan[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Period modal
  const now = new Date();
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i);
  const [showModal, setShowModal] = useState(false);
  const [tempYear, setTempYear] = useState<number | null>(null);
  const [tempMonth, setTempMonth] = useState<number | null>(null);

  // If the screen is re-opened with a different ?quick=, follow it
  useEffect(() => {
    setQuick(isQuickKey(params.quick) ? params.quick : null);
    setPage(1);
  }, [params.quick]);

  // Switching view (branch/team/all) invalidates the current page
  useEffect(() => {
    setPage(1);
  }, [queryParams]);

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
    const id = ++reqId.current;
    try {
      setError(null);
      const filters: Record<string, string> = {
        page: String(page),
        per_page: String(PER_PAGE),
        ...(quick ? QUICK[quick].build() : {}),
        ...(searchToParam(appliedSearch) ?? {}),
        ...(disbursedRange(year, month) ?? {}),
      };
      const result = await fetchJson(`/api/mobile/staff/loans/report?${toQuery(filters)}${queryParams}`);
      if (id !== reqId.current) return; // a newer request superseded this one

      const items = result.total_items ?? result.all_items_total ?? result.pagination?.total_items ?? 0;
      const pages =
        result.total_pages ?? result.pagination?.total_pages ?? Math.max(1, Math.ceil(items / PER_PAGE));
      setRows(result.payload ?? []);
      setTotalItems(items);
      setTotalPages(Math.max(1, pages));
      setTotals(result.totals ?? null);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setRows([]);
      setError(e?.message || 'Failed to load loans');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [fetchJson, page, quick, appliedSearch, year, month, queryParams]);

  const fetchSummary = useCallback(async () => {
    try {
      const result = await fetchJson(`/api/mobile/staff/loans/summary?dummy=1${queryParams}`);
      setSummary(result.payload ?? null);
    } catch (e) {
      console.warn('[LoansReport] summary failed:', e); // cards are optional; list still works
    }
  }, [fetchJson, queryParams]);

  useEffect(() => {
    setLoading(true);
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [page]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchReport(), fetchSummary()]);
    setRefreshing(false);
  };

  /* ---------------- handlers ---------------- */

  const applyQuick = (key: QuickKey | null) => {
    setQuick(key);
    setPage(1);
  };

  const submitSearch = () => {
    setAppliedSearch(searchInput);
    setPage(1);
  };

  const openModal = () => {
    setTempYear(year);
    setTempMonth(month);
    setShowModal(true);
  };

  const applyPeriod = () => {
    setYear(tempYear);
    setMonth(tempMonth);
    setPage(1);
    setShowModal(false);
  };

  const pickMonth = (i: number) => {
    if (tempMonth === i) return setTempMonth(null);
    setTempMonth(i);
    if (tempYear === null) setTempYear(now.getFullYear()); // a month needs a year
  };

  const openMember = (loan: Loan) => {
    const memberId = loan.member_id ?? loan.client_id;
    if (memberId) router.push({ pathname: '/loan_details' as any, params: { member_id: memberId } });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/actions' as any));

  const hasPeriod = year !== null;
  const periodLabel =
    year === null ? '' : month === null ? `All of ${year}` : `${MONTHS[month]} ${year}`;

  /* ---------------- render pieces ---------------- */

  const renderQuickCards = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.quickRow}
      style={{ marginBottom: 12 }}
    >
      {QUICK_ORDER.map((key) => {
        const def = QUICK[key];
        const bucket = summary?.[def.summaryKey];
        const active = quick === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.quickCard, active && styles.quickCardActive]}
            onPress={() => applyQuick(active ? null : key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.quickCount, active && { color: 'white' }]}>
              {bucket ? bucket.total : '–'}
            </Text>
            <Text style={[styles.quickLabel, active && { color: 'white' }]}>{def.label}</Text>
            <Text style={[styles.quickAmount, active && { color: 'white' }]}>
              Kes {bucket ? fmt(bucket.amount) : '0.00'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const header = (
    <View>
      {quick && (
        <View style={styles.filterBanner}>
          <Text style={styles.filterText}>Showing: Loans {QUICK[quick].label.toLowerCase()}</Text>
          <TouchableOpacity onPress={() => applyQuick(null)} style={styles.clearFilterButton}>
            <Text style={styles.clearFilterText}>Clear Filter ✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.content}>
        {renderQuickCards()}

        <View style={styles.totalSection}>
          <View>
            <Text style={styles.totalLabel}>Total Loans</Text>
            <Text style={styles.totalValue}>{totalItems.toLocaleString()}</Text>
          </View>
          {totals?.total_balance !== undefined && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.totalLabel}>Outstanding balance</Text>
              <Text style={styles.totalValueSmall}>Kes {fmt(totals.total_balance)}</Text>
            </View>
          )}
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Name, phone, ID no or loan ID"
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={submitSearch}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={submitSearch}>
              <Ionicons name="search" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={openModal}>
            <Ionicons name="calendar-outline" size={20} color="white" />
            {hasPeriod && <View style={styles.filterActiveDot} />}
          </TouchableOpacity>
        </View>

        {(hasPeriod || appliedSearch !== '') && (
          <View style={styles.pillRow}>
            {hasPeriod && (
              <View style={styles.pill}>
                <Ionicons name="calendar" size={13} color={BLUE} style={{ marginRight: 4 }} />
                <Text style={styles.pillText}>Disbursed: {periodLabel}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setYear(null);
                    setMonth(null);
                    setPage(1);
                  }}
                  style={styles.pillClearBtn}
                >
                  <Text style={styles.pillClearText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            {appliedSearch !== '' && (
              <View style={styles.pill}>
                <Ionicons name="search" size={13} color={BLUE} style={{ marginRight: 4 }} />
                <Text style={styles.pillText}>{appliedSearch}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setSearchInput('');
                    setAppliedSearch('');
                    setPage(1);
                  }}
                  style={styles.pillClearBtn}
                >
                  <Text style={styles.pillClearText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.nameCell]}>Name</Text>
          <Text style={styles.headerCell}>Paid</Text>
          <Text style={styles.headerCell}>Balance</Text>
          <Text style={[styles.headerCell, styles.dateCell]}>Due</Text>
          <Text style={[styles.headerCell, styles.statusCell]}>Status</Text>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: Loan }) => {
    const st = statusOf(item.status);
    const expanded = expandedId === item.id;
    const disbursed = !!item.disbursed_at;
    return (
      <View style={styles.rowWrap}>
        <TouchableOpacity
          style={styles.tableRow}
          activeOpacity={0.7}
          onPress={() => setExpandedId(expanded ? null : item.id)}
        >
          <TouchableOpacity style={[styles.cellBox, styles.nameCell]} onPress={() => openMember(item)}>
            <Text style={styles.nameCellText}>{shortName(item.member_name)}</Text>
            <Text style={styles.loanIdText}>#{item.id}</Text>
          </TouchableOpacity>
          <Text style={styles.cell}>{Number(item.amount_paid ?? 0).toLocaleString()}</Text>
          <Text style={styles.cell}>{Number(item.balance ?? 0).toLocaleString()}</Text>
          <Text style={[styles.cell, styles.dateCell, styles.dateCellText]}>
            {disbursed ? fmtDate(item.due_date) : 'PENDING'}
          </Text>
          <Text style={[styles.cell, styles.statusCell, { color: st.fg }]}>{st.label}</Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.details}>
            <DetailRow label="Branch" value={item.branch?.name || '–'} />
            <DetailRow label="Product" value={item.product?.name || '–'} />
            <DetailRow label="Disbursed" value={fmtDate(item.disbursed_at)} />
            <DetailRow label="Principal" value={fmt(item.amount)} />
            <DetailRow label="Interest" value={fmt(item.interest)} />
            <DetailRow label="Charges" value={fmt(item.charges)} />
            <DetailRow label="Penalties" value={fmt(item.penalties)} />
            <DetailRow label="Waiver" value={fmt(item.credit)} />
            <DetailRow label="Debit" value={fmt(item.debit)} />
            <DetailRow label="Expected" value={fmt(item.amount_repayable)} />
            <DetailRow label="Paid" value={fmt(item.amount_paid)} />
            <DetailRow label="Balance" value={fmt(item.balance)} bold />
          </View>
        )}
      </View>
    );
  };

  const empty = (
    <View style={styles.emptyContainer}>
      {loading ? (
        <>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading loans...</Text>
        </>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <Text style={styles.emptyText}>No loans found</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loans Report</Text>
      </View>

      <FlatList
        ref={listRef}
        data={loading ? [] : rows}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BLUE]} tintColor={BLUE} />}
        contentContainerStyle={{ paddingBottom: 8 }}
      />

      {/* Pagination */}
      <View style={styles.pagination}>
        <TouchableOpacity
          style={styles.pageButton}
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          <Ionicons name="arrow-back" size={20} color={page <= 1 ? '#ccc' : '#666'} />
        </TouchableOpacity>
        <Text style={styles.pageText}>
          Page {page} of {totalPages}
        </Text>
        <TouchableOpacity
          style={[styles.pageButton, styles.nextButton, (page >= totalPages || loading) && { opacity: 0.4 }]}
          onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
        >
          <Ionicons name="arrow-forward" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Period modal (server-side disbursement date filter) */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Disbursed in</Text>
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

const DetailRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, bold && { fontWeight: '700' }]}>{value}</Text>
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
  content: { padding: 16, paddingBottom: 0 },

  // Banner
  filterBanner: {
    backgroundColor: '#FFF3E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  filterText: { fontSize: 14, fontWeight: '600', color: '#E65100', flex: 1 },
  clearFilterButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff', borderRadius: 4 },
  clearFilterText: { fontSize: 12, fontWeight: '600', color: '#E65100' },

  // Quick cards
  quickRow: { gap: 10, paddingRight: 8 },
  quickCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 130,
    borderWidth: 1.5,
    borderColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  quickCardActive: { backgroundColor: BLUE, borderColor: BLUE },
  quickCount: { fontSize: 22, fontWeight: 'bold', color: BLUE },
  quickLabel: { fontSize: 12, color: '#333', marginTop: 2 },
  quickAmount: { fontSize: 11, color: '#666', marginTop: 4 },

  // Total
  totalSection: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  totalLabel: { fontSize: 14, color: '#666', marginBottom: 4 },
  totalValue: { fontSize: 24, fontWeight: 'bold', color: BLUE },
  totalValueSmall: { fontSize: 16, fontWeight: 'bold', color: '#333' },

  // Search
  searchContainer: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  searchBox: {
    flex: 1,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 6,
    elevation: 1,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14 },
  filterButton: {
    backgroundColor: BLUE,
    width: 48,
    height: 48,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
    borderWidth: 1,
    borderColor: 'white',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
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

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#333', textAlign: 'center' },
  nameCell: { flex: 1.2, textAlign: 'left', paddingLeft: 8 },
  dateCell: { flex: 0.9 },
  statusCell: { flex: 1, fontSize: 11, fontWeight: '600' },
  rowWrap: { marginHorizontal: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  cellBox: { justifyContent: 'center' },
  cell: { flex: 1, fontSize: 13, color: '#333', textAlign: 'center' },
  nameCellText: { fontSize: 13, color: BLUE, fontWeight: '500' },
  loanIdText: { fontSize: 10, color: '#999', marginTop: 2 },
  dateCellText: { fontSize: 11 },

  // Expanded details
  details: { backgroundColor: '#FAFAFA', paddingHorizontal: 16, paddingVertical: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 12, color: '#777' },
  detailValue: { fontSize: 12, color: '#222' },

  emptyContainer: { alignItems: 'center', paddingVertical: 40, marginHorizontal: 16, backgroundColor: 'white' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyText: { fontSize: 14, color: '#666' },
  errorText: { fontSize: 14, color: 'red', paddingHorizontal: 20, textAlign: 'center' },

  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16,
    backgroundColor: '#F5F5F5',
  },
  pageButton: { padding: 8, borderRadius: 6, backgroundColor: '#F0F0F0' },
  nextButton: { backgroundColor: BLUE },
  pageText: { fontSize: 14, color: '#666' },

  // Modal
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
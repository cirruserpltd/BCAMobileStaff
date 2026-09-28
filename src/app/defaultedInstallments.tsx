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

const RED = '#E53935';
const BLUE = '#4285F4';
const PER_PAGE = 20;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Installment = {
  id?: number | string;
  loan: number;
  due_date?: string | null;
  amount: number;
  amount_paid?: number;
  installment_penalty_amount?: number;
  cycle_number?: number | string;
  status: number;
};

type LoanExtra = {
  member?: { id?: number; name?: string; phone?: string; id_no?: string };
  branch?: { name?: string };
  product?: { name?: string };
  disbursed_at?: string | null;
};

type Totals = { total_expected?: number; total_paid?: number; total_balance?: number };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n?: number | string | null) =>
  Number(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });

const STATUS: Record<string, { label: string; fg: string }> = {
  '0': { label: 'Pending', fg: '#FBC02D' },
  '1': { label: 'Partial', fg: '#E65100' },
  '2': { label: 'Paid', fg: '#00796B' },
  '3': { label: 'Defaulted', fg: '#D32F2F' },
};
const statusOf = (s: number) => STATUS[String(s)] ?? { label: 'Unknown', fg: '#607D8B' };

const shortName = (name?: string) => (name ? name.split(' ').slice(0, 2).join(' ') : 'N/A');

const fmtDate = (d?: string | null) => {
  if (!d) return 'PENDING';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString('en-KE');
};

const cycleOf = (c?: number | string) => (c === 'penalty' ? 'Penalty' : String(c ?? '–'));

// Local-date yyyy-mm-dd (toISOString would shift the day in UTC+3)
const ymd = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const duePeriod = (year: number | null, month: number | null): Record<string, string> | null => {
  if (year === null) return null;
  if (month === null) return { due_date_from: `${year}-01-01`, due_date_to: `${year}-12-31` };
  const mm = String(month + 1).padStart(2, '0');
  const last = new Date(year, month + 1, 0).getDate();
  return { due_date_from: `${year}-${mm}-01`, due_date_to: `${year}-${mm}-${last}` };
};

const toQuery = (obj: Record<string, string>) =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DefaultedInstallmentsScreen() {
  const { authFetch } = useAuth();
  const { queryParams } = useViewPreference();
  const params = useLocalSearchParams<{ member_type?: string; title?: string }>();

  const listRef = useRef<FlatList<Installment>>(null);
  const reqId = useRef(0); // guards against out-of-order responses

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [memberType, setMemberType] = useState<string | null>(params.member_type ?? null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  const [rows, setRows] = useState<Installment[]>([]);
  const [extra, setExtra] = useState<Record<string, LoanExtra>>({});
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Period modal
  const now = new Date();
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i);
  const [showModal, setShowModal] = useState(false);
  const [tempYear, setTempYear] = useState<number | null>(null);
  const [tempMonth, setTempMonth] = useState<number | null>(null);

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
      if (!res.ok || data.success === false) throw new Error(data.error || `Request failed: ${path}`);
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
        ...(memberType ? { member_type: memberType } : {}),
        ...(searchToParam(appliedSearch) ?? {}),
        ...(duePeriod(year, month) ?? { due_date_to: ymd(-1) }), // defaulted = past due by default
      };
      const result = await fetchJson(
        `/api/mobile/staff/installments/defaulted/report?${toQuery(filters)}${queryParams}`
      );
      if (id !== reqId.current) return; // a newer request superseded this one

      const items = result.total_items ?? result.all_items_total ?? result.pagination?.total_items ?? 0;
      const pages =
        result.total_pages ?? result.pagination?.total_pages ?? Math.max(1, Math.ceil(items / PER_PAGE));
      setRows(result.data ?? result.payload ?? []);
      setExtra(result.additional_data ?? {});
      setTotalItems(items);
      setTotalPages(Math.max(1, pages));
      setTotals(result.totals ?? null);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setRows([]);
      setExtra({});
      setError(e?.message || 'Failed to load installments');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [fetchJson, page, appliedSearch, memberType, year, month, queryParams]);

  useEffect(() => {
    setLoading(true);
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [page]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReport();
    setRefreshing(false);
  };

  /* ---------------- handlers ---------------- */

  const submitSearch = () => {
    setAppliedSearch(searchInput);
    setPage(1);
  };

  const applyMemberType = (value: string | null) => {
    setMemberType(value);
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

  const openMember = (item: Installment) => {
    const memberId = extra[String(item.loan)]?.member?.id;
    if (memberId) router.push({ pathname: '/loan_details' as any, params: { member_id: memberId } });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/actions' as any));

  const hasPeriod = year !== null;
  const periodLabel =
    year === null ? '' : month === null ? `All of ${year}` : `${MONTHS[month]} ${year}`;

  /* ---------------- render pieces ---------------- */

  const header = (
    <View style={styles.content}>
      <View style={styles.totalSection}>
        <View>
          <Text style={styles.totalLabel}>Defaulted installments</Text>
          <Text style={styles.totalValue}>{totalItems.toLocaleString()}</Text>
        </View>
        {totals?.total_balance !== undefined && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.totalLabel}>Outstanding balance</Text>
            <Text style={styles.totalValueSmall}>Kes {fmt(totals.total_balance)}</Text>
          </View>
        )}
      </View>

      {totals && (
        <View style={styles.totalsStrip}>
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>{fmt(totals.total_expected)}</Text>
            <Text style={styles.stripLabel}>Expected</Text>
          </View>
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>{fmt(totals.total_paid)}</Text>
            <Text style={styles.stripLabel}>Paid</Text>
          </View>
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: RED }]}>{fmt(totals.total_balance)}</Text>
            <Text style={styles.stripLabel}>Balance</Text>
          </View>
        </View>
      )}

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
              onPress={() => applyMemberType(c.key)}
            >
              <Text style={[styles.typeChipText, active && { color: 'white' }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {(hasPeriod || appliedSearch !== '') && (
        <View style={styles.pillRow}>
          {hasPeriod && (
            <View style={styles.pill}>
              <Ionicons name="calendar" size={13} color={RED} style={{ marginRight: 4 }} />
              <Text style={styles.pillText}>Due: {periodLabel}</Text>
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
              <Ionicons name="search" size={13} color={RED} style={{ marginRight: 4 }} />
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
        <Text style={[styles.headerCell, styles.nameCell]}>Member</Text>
        <Text style={[styles.headerCell, styles.dateCell]}>Due</Text>
        <Text style={styles.headerCell}>Expected</Text>
        <Text style={styles.headerCell}>Balance</Text>
        <Text style={[styles.headerCell, styles.statusCell]}>Status</Text>
      </View>
    </View>
  );

  const renderItem = ({ item, index }: { item: Installment; index: number }) => {
    const key = String(item.id ?? `${item.loan}-${item.cycle_number}-${index}`);
    const st = statusOf(item.status);
    const loan = extra[String(item.loan)] || {};
    const balance = Number(item.amount ?? 0) - Number(item.amount_paid ?? 0);
    const expanded = expandedKey === key;

    return (
      <View style={styles.rowWrap}>
        <TouchableOpacity
          style={styles.tableRow}
          activeOpacity={0.7}
          onPress={() => setExpandedKey(expanded ? null : key)}
        >
          <TouchableOpacity style={[styles.cellBox, styles.nameCell]} onPress={() => openMember(item)}>
            <Text style={styles.nameCellText}>{shortName(loan.member?.name)}</Text>
            <Text style={styles.loanIdText}>#{item.loan} • cycle {cycleOf(item.cycle_number)}</Text>
          </TouchableOpacity>
          <Text style={[styles.cell, styles.dateCell, styles.dateCellText]}>{fmtDate(item.due_date)}</Text>
          <Text style={styles.cell}>{Number(item.amount ?? 0).toLocaleString()}</Text>
          <Text style={[styles.cell, styles.balanceText]}>{balance.toLocaleString()}</Text>
          <Text style={[styles.cell, styles.statusCell, { color: st.fg }]}>{st.label}</Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.details}>
            <DetailRow label="Member" value={loan.member?.name || '–'} />
            <DetailRow label="Phone" value={loan.member?.phone || '–'} />
            <DetailRow label="ID Number" value={loan.member?.id_no || '–'} />
            <DetailRow label="Loan ID" value={`#${item.loan}`} />
            <DetailRow label="Branch" value={loan.branch?.name || '–'} />
            <DetailRow label="Product" value={loan.product?.name || '–'} />
            <DetailRow label="Disbursed" value={fmtDate(loan.disbursed_at)} />
            <DetailRow label="Due date" value={fmtDate(item.due_date)} />
            <DetailRow label="Cycle" value={cycleOf(item.cycle_number)} />
            <DetailRow label="Expected" value={fmt(item.amount)} />
            <DetailRow label="DIP (penalty)" value={fmt(item.installment_penalty_amount)} />
            <DetailRow label="Paid" value={fmt(item.amount_paid)} />
            <DetailRow label="Balance" value={fmt(balance)} bold />
            <TouchableOpacity style={styles.profileBtn} onPress={() => openMember(item)}>
              <Text style={styles.profileBtnText}>View client</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const empty = (
    <View style={styles.emptyContainer}>
      {loading ? (
        <>
          <ActivityIndicator size="large" color={RED} />
          <Text style={styles.loadingText}>Loading installments...</Text>
        </>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={40} color="#4CAF50" />
          <Text style={styles.emptyText}>No defaulted installments</Text>
          <Text style={styles.emptySubText}>Nothing overdue for this view</Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.title || 'Defaulted Installments'}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={loading ? [] : rows}
        renderItem={renderItem}
        keyExtractor={(item, index) => String(item.id ?? `${item.loan}-${item.cycle_number}-${index}`)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[RED]} tintColor={RED} />}
        contentContainerStyle={{ paddingBottom: 8 }}
      />

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

      {/* Period modal (server-side due date filter) */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Due in</Text>
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
                  <Text style={[styles.yearChipText, tempYear === y && { color: RED }]}>{y}</Text>
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
    <Text style={[styles.detailValue, bold && { fontWeight: '700', color: RED }]}>{value}</Text>
  </View>
);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: RED,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 50,
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: 'white' },
  content: { padding: 16, paddingBottom: 0 },

  totalSection: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  totalLabel: { fontSize: 14, color: '#666', marginBottom: 4 },
  totalValue: { fontSize: 24, fontWeight: 'bold', color: RED },
  totalValueSmall: { fontSize: 16, fontWeight: 'bold', color: '#333' },

  totalsStrip: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 12,
    elevation: 1,
  },
  stripItem: { flex: 1, alignItems: 'center' },
  stripValue: { fontSize: 14, fontWeight: '700', color: '#333' },
  stripLabel: { fontSize: 11, color: '#666', marginTop: 2 },

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
    backgroundColor: RED,
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
    backgroundColor: '#FFEB3B',
    borderWidth: 1,
    borderColor: 'white',
  },

  chipRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeChipActive: { backgroundColor: RED, borderColor: RED },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#555' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: RED },
  pillClearBtn: { marginLeft: 8, backgroundColor: RED, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pillClearText: { fontSize: 11, color: 'white', fontWeight: '600' },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerCell: { flex: 1, fontSize: 12, fontWeight: '600', color: '#333', textAlign: 'center' },
  nameCell: { flex: 1.3, textAlign: 'left', paddingLeft: 8 },
  dateCell: { flex: 0.9 },
  statusCell: { flex: 0.9, fontSize: 11, fontWeight: '600' },
  rowWrap: { marginHorizontal: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  cellBox: { justifyContent: 'center' },
  cell: { flex: 1, fontSize: 13, color: '#333', textAlign: 'center' },
  nameCellText: { fontSize: 13, color: BLUE, fontWeight: '500' },
  loanIdText: { fontSize: 10, color: '#999', marginTop: 2 },
  dateCellText: { fontSize: 11 },
  balanceText: { fontWeight: '700', color: RED },

  details: { backgroundColor: '#FAFAFA', paddingHorizontal: 16, paddingVertical: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 12, color: '#777' },
  detailValue: { fontSize: 12, color: '#222' },
  profileBtn: { marginTop: 10, backgroundColor: RED, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  profileBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', paddingVertical: 40, marginHorizontal: 16, backgroundColor: 'white' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyText: { fontSize: 15, color: '#666', fontWeight: '600', marginTop: 8 },
  emptySubText: { fontSize: 13, color: '#999', marginTop: 4 },
  errorText: { fontSize: 14, color: 'red', paddingHorizontal: 20, textAlign: 'center' },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16,
    backgroundColor: '#F5F5F5',
  },
  pageButton: { padding: 8, borderRadius: 6, backgroundColor: '#F0F0F0' },
  nextButton: { backgroundColor: RED },
  pageText: { fontSize: 14, color: '#666' },

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
  yearChipActive: { backgroundColor: '#FFEBEE', borderColor: RED },
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
  monthChipActive: { backgroundColor: RED, borderColor: RED },
  monthChipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  modalActions: { flexDirection: 'row', gap: 10 },
  resetBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: '#F0F0F0', alignItems: 'center' },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#555' },
  applyBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: RED, alignItems: 'center' },
  applyBtnText: { fontSize: 14, fontWeight: '600', color: 'white' },
});
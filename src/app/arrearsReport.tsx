import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';

const RED = '#E53935';
const BLUE = '#4285F4';
const PER_PAGE = 20;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ArrearsRow = {
  member_id: number;
  client_name: string;
  client_phone?: string;
  phone?: string;
  id_no?: string;
  branch_name?: string;
  team?: string;
  loans_with_arrears: number;
  overdue_installments_count: number;
  total_expected: number;
  total_paid: number;
  total_arrears: number;
};

type ArrearsSummary = {
  total_clients_with_arrears?: number;
  total_loans_with_arrears?: number;
  total_overdue_installments?: number;
  total_expected_amount?: number;
  total_paid_amount?: number;
  total_arrears_amount?: number;
};

type SortKey = 'total_arrears' | 'total_expected' | 'total_paid' | 'overdue_installments_count' | 'client_name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'total_arrears', label: 'Arrears' },
  { key: 'overdue_installments_count', label: 'Overdue inst.' },
  { key: 'total_expected', label: 'Expected' },
  { key: 'total_paid', label: 'Paid' },
  { key: 'client_name', label: 'Name' },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n?: number | string | null) =>
  Number(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });

const fmtInt = (n?: number | null) => Number(n ?? 0).toLocaleString('en-KE');

const shortName = (name?: string) => (name ? name.split(' ').slice(0, 2).join(' ') : 'N/A');

const fmtPhone = (phone?: string | null) => {
  if (!phone) return '–';
  return phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
};

// One search box -> the right backend filter
const searchToParam = (q: string): Record<string, string> | null => {
  const s = q.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    if (s.length >= 9) return { phone: s };
    return { id_no: s };
  }
  return { client_name: s };
};

const toQuery = (obj: Record<string, string>) =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function ArrearsReportScreen() {
  const { authFetch } = useAuth();
  const { queryParams } = useViewPreference();

  const listRef = useRef<FlatList<ArrearsRow>>(null);
  const reqId = useRef(0); // guards against out-of-order responses

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('total_arrears');

  const [rows, setRows] = useState<ArrearsRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState<ArrearsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
        order_by: sortBy,
        order_direction: sortBy === 'client_name' ? 'asc' : 'desc',
        ...(searchToParam(appliedSearch) ?? {}),
      };
      const result = await fetchJson(`/api/mobile/staff/loans/arrears?${toQuery(filters)}${queryParams}`);
      if (id !== reqId.current) return; // a newer request superseded this one

      const items = result.all_items_total ?? 0;
      const pages = result.total_pages ?? Math.max(1, Math.ceil(items / PER_PAGE));
      setRows(result.payload ?? []);
      setTotalItems(items);
      setTotalPages(Math.max(1, pages));
      setSummary(result.additional_data?.summary ?? null);
    } catch (e: any) {
      if (id !== reqId.current) return;
      setRows([]);
      setError(e?.message || 'Failed to load arrears');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [fetchJson, page, appliedSearch, sortBy, queryParams]);

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

  const applySort = (key: SortKey) => {
    setSortBy(key);
    setPage(1);
  };

  const openMember = (row: ArrearsRow) => {
    if (row.member_id) {
      router.push({ pathname: '/loan_details' as any, params: { member_id: row.member_id } });
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/actions' as any));

  /* ---------------- render pieces ---------------- */

  const SummaryCard = ({
    label,
    value,
    amount,
  }: {
    label: string;
    value: string;
    amount?: boolean;
  }) => (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, amount && styles.summaryValueAmount]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );

  const header = (
    <View style={styles.content}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.summaryRow}
        style={{ marginBottom: 12 }}
      >
        <SummaryCard label="Clients with arrears" value={fmtInt(summary?.total_clients_with_arrears)} />
        <SummaryCard label="Loans with arrears" value={fmtInt(summary?.total_loans_with_arrears)} />
        <SummaryCard label="Overdue installments" value={fmtInt(summary?.total_overdue_installments)} />
        <SummaryCard label="Total expected" value={`Kes ${fmt(summary?.total_expected_amount)}`} amount />
        <SummaryCard label="Total paid" value={`Kes ${fmt(summary?.total_paid_amount)}`} amount />
        <SummaryCard label="Total arrears" value={`Kes ${fmt(summary?.total_arrears_amount)}`} amount />
      </ScrollView>

      <View style={styles.totalSection}>
        <View>
          <Text style={styles.totalLabel}>Clients in arrears</Text>
          <Text style={styles.totalValue}>{totalItems.toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.totalLabel}>Total arrears</Text>
          <Text style={styles.totalValueSmall}>Kes {fmt(summary?.total_arrears_amount)}</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Name, phone or ID no"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={submitSearch}>
            <Ionicons name="search" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
        {SORTS.map((s) => {
          const active = sortBy === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.sortChip, active && styles.sortChipActive]}
              onPress={() => applySort(s.key)}
            >
              <Text style={[styles.sortChipText, active && { color: 'white' }]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {appliedSearch !== '' && (
        <View style={styles.pillRow}>
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
        </View>
      )}

      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.nameCell]}>Name</Text>
        <Text style={styles.headerCell}>Phone</Text>
        <Text style={[styles.headerCell, styles.instCell]}>Overdue</Text>
        <Text style={[styles.headerCell, styles.arrearsCell]}>Arrears</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: ArrearsRow }) => {
    const expanded = expandedId === item.member_id;
    return (
      <View style={styles.rowWrap}>
        <TouchableOpacity
          style={styles.tableRow}
          activeOpacity={0.7}
          onPress={() => setExpandedId(expanded ? null : item.member_id)}
        >
          <TouchableOpacity style={[styles.cellBox, styles.nameCell]} onPress={() => openMember(item)}>
            <Text style={styles.nameCellText}>{shortName(item.client_name)}</Text>
            <Text style={styles.subText}>
              {item.loans_with_arrears} loan{item.loans_with_arrears !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.cell, styles.phoneCellText]}>{fmtPhone(item.client_phone ?? item.phone)}</Text>
          <Text style={[styles.cell, styles.instCell]}>{fmtInt(item.overdue_installments_count)}</Text>
          <Text style={[styles.cell, styles.arrearsCell, styles.arrearsText]}>
            {Number(item.total_arrears ?? 0).toLocaleString()}
          </Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.details}>
            <DetailRow label="Full name" value={item.client_name || '–'} />
            <DetailRow label="Phone" value={fmtPhone(item.client_phone ?? item.phone)} />
            <DetailRow label="ID Number" value={item.id_no || '–'} />
            <DetailRow label="Branch" value={item.branch_name || '–'} />
            <DetailRow label="Team" value={item.team || '–'} />
            <DetailRow label="Loans with arrears" value={fmtInt(item.loans_with_arrears)} />
            <DetailRow label="Overdue installments" value={fmtInt(item.overdue_installments_count)} />
            <DetailRow label="Expected" value={fmt(item.total_expected)} />
            <DetailRow label="Paid" value={fmt(item.total_paid)} />
            <DetailRow label="Arrears" value={fmt(item.total_arrears)} bold />
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
          <Text style={styles.loadingText}>Loading arrears...</Text>
        </>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={40} color="#4CAF50" />
          <Text style={styles.emptyText}>No arrears found</Text>
          <Text style={styles.emptySubText}>All clients are up to date</Text>
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
        <Text style={styles.headerTitle}>Arrears Report</Text>
      </View>

      <FlatList
        ref={listRef}
        data={loading ? [] : rows}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.member_id)}
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

  // Summary cards
  summaryRow: { gap: 10, paddingRight: 8 },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 130,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  summaryValue: { fontSize: 22, fontWeight: 'bold', color: RED },
  summaryValueAmount: { fontSize: 15 },
  summaryLabel: { fontSize: 11, color: '#666', marginTop: 4 },

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
  totalValue: { fontSize: 24, fontWeight: 'bold', color: RED },
  totalValueSmall: { fontSize: 16, fontWeight: 'bold', color: '#333' },

  // Search + sort
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
  sortRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  sortChipActive: { backgroundColor: RED, borderColor: RED },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#555' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
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

  // Table
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
  nameCell: { flex: 1.2, textAlign: 'left', paddingLeft: 8 },
  instCell: { flex: 0.7 },
  arrearsCell: { flex: 1 },
  rowWrap: { marginHorizontal: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  cellBox: { justifyContent: 'center' },
  cell: { flex: 1, fontSize: 13, color: '#333', textAlign: 'center' },
  nameCellText: { fontSize: 13, color: BLUE, fontWeight: '500' },
  phoneCellText: { fontSize: 12 },
  arrearsText: { fontWeight: '700', color: RED },
  subText: { fontSize: 10, color: '#999', marginTop: 2 },

  // Expanded details
  details: { backgroundColor: '#FAFAFA', paddingHorizontal: 16, paddingVertical: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 12, color: '#777' },
  detailValue: { fontSize: 12, color: '#222' },
  profileBtn: {
    marginTop: 10,
    backgroundColor: RED,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  profileBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', paddingVertical: 40, marginHorizontal: 16, backgroundColor: 'white' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  emptyText: { fontSize: 15, color: '#666', fontWeight: '600', marginTop: 8 },
  emptySubText: { fontSize: 13, color: '#999', marginTop: 4 },
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
  nextButton: { backgroundColor: RED },
  pageText: { fontSize: 14, color: '#666' },
});
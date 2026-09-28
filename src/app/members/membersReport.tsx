import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';

const ACCENT = '#2D5BFF';
const PER_PAGE = 15;

type MemberRow = {
  id: string | number;
  name: string;
  phone: string;
  branch: string;
  status: string;
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'Active': { bg: '#E8F5E9', fg: '#388E3C' },
  'Declined': { bg: '#FFEBEE', fg: '#C62828' },
  'Pending BM Approval': { bg: '#FFF9E6', fg: '#F57C00' },
  'Pending HQ Approval': { bg: '#FFF3E0', fg: '#E65100' },
};

export default function MemberReportScreen() {
  const { authFetch } = useAuth();
  const { queryParams } = useViewPreference();

  // im_hq_approval / im_hq_approval_retrieval arrive as route params from
  // ActionsScreen's "Members awaiting approval" action; title is optional.
  const params = useLocalSearchParams<{
    title?: string;
    im_hq_approval?: string;
    im_hq_approval_retrieval?: string;
  }>();

  const [imHqApproval, setImHqApproval] = useState<string | undefined>(params.im_hq_approval);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [imHqApproval, debouncedSearch]);

  const filterLabel = useMemo(() => {
    if (!imHqApproval) return null;
    return imHqApproval === 'none' ? 'Im Hq Approval: none' : `Im Hq Approval: ${imHqApproval}`;
  }, [imHqApproval]);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const search_params = new URLSearchParams();
      search_params.set('page', String(targetPage));
      search_params.set('per_page', String(PER_PAGE));
      if (imHqApproval) search_params.set('im_hq_approval', imHqApproval);
      if (debouncedSearch) {
        // A single search box covering name/phone/id_no keeps the mobile
        // filter row simple; the backend matches against all three.
        search_params.set('name', debouncedSearch);
        search_params.set('phone', debouncedSearch);
        search_params.set('id_no', debouncedSearch);
      }

      const res = await authFetch(
        `/api/mobile/staff/members/individual/report?${search_params.toString()}${queryParams}`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load members');
      }
      setRows(data.payload || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total_count || 0);
    },
    [authFetch, imHqApproval, debouncedSearch, queryParams]
  );

  const load = useCallback(
    async (targetPage: number) => {
      try {
        setError(null);
        await fetchPage(targetPage);
      } catch (e: any) {
        setError(e?.message || 'Failed to load members');
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    setLoading(true);
    load(page).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, imHqApproval, debouncedSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(page);
    setRefreshing(false);
  };

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  const renderHeaderRow = () => (
    <View style={[styles.row, styles.headerRow]}>
      <Text style={[styles.cell, styles.headerCell, styles.colName]}>Name</Text>
      <Text style={[styles.cell, styles.headerCell, styles.colPhone]}>Phone</Text>
      <Text style={[styles.cell, styles.headerCell, styles.colBranch]}>Branch</Text>
      <Text style={[styles.cell, styles.headerCell, styles.colStatus]}>Status</Text>
    </View>
  );

  const renderItem = ({ item }: { item: MemberRow }) => {
    const statusStyle = STATUS_COLORS[item.status] || { bg: '#F0F0F0', fg: '#555' };
    return (
      <View style={styles.row}>
        <Text style={[styles.cell, styles.colName]} numberOfLines={1}>
          {item.name}
        </Text>

        <TouchableOpacity
          style={styles.colPhone}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          onPress={() =>
            router.push({ pathname: '/members/individualProfile', params: { id: String(item.id) } } as any)
          }
        >
          <Text style={[styles.cell, styles.phoneLink]} numberOfLines={1}>
            {item.phone}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.cell, styles.colBranch]} numberOfLines={1}>
          {item.branch}
        </Text>
        <View style={[styles.colStatus, styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.fg }]} numberOfLines={1}>
            {item.status}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerSection}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={ACCENT} />
          </TouchableOpacity>
          <Text style={styles.title}>{params.title || 'Members Report'}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#999" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone or ID No"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        {filterLabel && (
          <View style={styles.filterChipRow}>
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>{filterLabel}</Text>
              <TouchableOpacity onPress={() => setImHqApproval(undefined)} hitSlop={8}>
                <Ionicons name="close" size={14} color={ACCENT} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={ACCENT} size="large" />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <FlatList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={renderHeaderRow}
            stickyHeaderIndices={[0]}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />}
            ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
            contentContainerStyle={{ paddingBottom: 12 }}
          />

          <View style={styles.paginationBar}>
            <Text style={styles.totalText}>{totalCount} total</Text>
            <View style={styles.pageControls}>
              <TouchableOpacity onPress={goPrev} disabled={page <= 1} style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}>
                <Ionicons name="chevron-back" size={18} color={page <= 1 ? '#BBB' : ACCENT} />
              </TouchableOpacity>
              <Text style={styles.pageLabel}>
                Page {page} of {totalPages}
              </Text>
              <TouchableOpacity
                onPress={goNext}
                disabled={page >= totalPages}
                style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
              >
                <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? '#BBB' : ACCENT} />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },

  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#000' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#000', padding: 0 },

  filterChipRow: { flexDirection: 'row', marginTop: 10 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  filterChipText: { fontSize: 11, fontWeight: '600', color: ACCENT, marginRight: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  headerRow: { backgroundColor: '#FAFAFA', paddingVertical: 10 },
  cell: { fontSize: 12, color: '#333' },
  headerCell: { fontWeight: '700', color: '#666', fontSize: 11, textTransform: 'uppercase' },

  colName: { flex: 1.3, paddingRight: 6 },
  colPhone: { flex: 1.1, paddingRight: 6 },
  colBranch: { flex: 1, paddingRight: 6 },
  colStatus: { flex: 1.3 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '700' },

  emptyText: { textAlign: 'center', color: '#999', marginTop: 40 },
  errorText: { textAlign: 'center', color: 'red', marginTop: 40, paddingHorizontal: 20 },

  paginationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  totalText: { fontSize: 11, color: '#999' },
  pageControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageBtn: { padding: 4 },
  pageBtnDisabled: { opacity: 0.5 },
  pageLabel: { fontSize: 12, color: '#333', fontWeight: '600' },
  phoneLink: { color: ACCENT, textDecorationLine: 'underline', fontWeight: '600' },
});
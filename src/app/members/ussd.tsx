import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';

const ACCENT = '#2D5BFF';
const ITEMS_PER_PAGE = 50;

type UssdRegistration = {
  id: number | string;
  created_at?: string;
  ussd_ref_code?: string;
  name?: string;
  phone_number?: string;
  town?: string;
  branch?: { id?: number; name?: string } | null;
  business_type?: string;
  status: 'pending' | 'branch_allocated' | 'assigned' | 'processed' | string;
};

type Branch = { id: number; name: string };
type Team = { id: number; name: string };

type ActionType = 'allocate' | 'assign' | 'process' | null;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  branch_allocated: 'Branch Allocated',
  assigned: 'Assigned',
  processed: 'Processed',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FFEBEE', text: '#C62828' },
  branch_allocated: { bg: '#FFF9E6', text: '#F57C00' },
  assigned: { bg: '#E3F2FD', text: '#1976D2' },
  processed: { bg: '#E8F5E9', text: '#388E3C' },
};

// Status values the picker cycles through. `undefined` means "no filter" (All).
const STATUS_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'Branch Allocated', value: 'branch_allocated' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Processed', value: 'processed' },
];

// Which action a row's status unlocks, mirroring the web dashboard's
// generateActionButtons() (pending -> Allocate, branch_allocated -> Assign,
// assigned -> Process, processed -> no action).
const ACTION_LABELS: Record<string, string> = {
  pending: 'Allocate',
  branch_allocated: 'Assign',
  assigned: 'Process',
};

const ACTION_TYPE_BY_STATUS: Record<string, ActionType> = {
  pending: 'allocate',
  branch_allocated: 'assign',
  assigned: 'process',
};

// Maps a status value to a screen title. Extend this if more entry points
// (assigned / processed) start linking into this same screen.
const SCREEN_TITLES: Record<string, string> = {
  pending: 'Leads Awaiting Allocation (HQ)',
  branch_allocated: 'Leads Awaiting Allocation (TL)',
};

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getFirstTwoNames(name?: string) {
  if (!name) return '-';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).join(' ');
}

export default function UssdActionsScreen() {
  const { authFetch } = useAuth();
  const params = useLocalSearchParams<{ status?: string; status_retrieval?: string }>();
  const initialStatus = typeof params.status === 'string' ? params.status : undefined;
  const statusRetrieval =
    typeof params.status_retrieval === 'string' ? params.status_retrieval : 'status';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [registrations, setRegistrations] = useState<UssdRegistration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(initialStatus);

  // Action modal state
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [selectedRequest, setSelectedRequest] = useState<UssdRegistration | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const screenTitle = (statusFilter && SCREEN_TITLES[statusFilter]) || 'USSD Actions';
  const hasMore = registrations.length < totalItems;

  // pageToLoad === 1 resets the list (initial load / pull-to-refresh / status change).
  // pageToLoad > 1 appends (infinite scroll "load more").
  const fetchData = useCallback(
    async (pageToLoad: number) => {
      try {
        setError(null);

        const query = new URLSearchParams();
        if (statusFilter) query.set(statusRetrieval || 'status', statusFilter);

        const res = await authFetch(
          `/api/mobile/staff/ussd/actions/${pageToLoad}/${ITEMS_PER_PAGE}?${query.toString()}`
        );
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await res.text().catch(() => '');
          throw new Error(
            `Expected JSON but got ${res.status} ${contentType || 'unknown content-type'} ` +
              `(first 80 chars: ${text.slice(0, 80)})`
          );
        }
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Request failed');
        }

        const allRegistrations: UssdRegistration[] = data.payload?.registrations || [];
        const filtered = statusFilter
          ? allRegistrations.filter((r) => r.status === statusFilter)
          : allRegistrations;

        setTotalItems(data.all_items_total || 0);
        setPage(data.current_page || pageToLoad);
        setRegistrations((prev) => (pageToLoad === 1 ? filtered : [...prev, ...filtered]));
      } catch (e: any) {
        console.warn('[UssdActionsScreen] fetch failed:', e);
        setError(e?.message || 'Failed to load USSD actions');
      }
    },
    [authFetch, statusFilter, statusRetrieval]
  );

  // Reset to page 1 whenever the filter changes (or on first mount).
  useEffect(() => {
    setLoading(true);
    fetchData(1).finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData(1);
    setRefreshing(false);
  };

  const onLoadMore = async () => {
    if (loadingMore || loading || refreshing || !hasMore) return;
    setLoadingMore(true);
    await fetchData(page + 1);
    setLoadingMore(false);
  };

  // Fires as the user scrolls; triggers onLoadMore once they're near the bottom.
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    if (distanceFromBottom < 200) {
      onLoadMore();
    }
  };

  const openActionModal = async (item: UssdRegistration) => {
    const type = ACTION_TYPE_BY_STATUS[item.status] || null;
    if (!type) return;

    setSelectedRequest(item);
    setSelectedOptionId(null);
    setActionType(type);
    setActionModalVisible(true);

    if (type === 'allocate') {
      setOptionsLoading(true);
      try {
        const res = await authFetch('/api/mobile/staff/ussd/branches');
        const data = await res.json();
        setBranches(data.success ? data.payload || [] : []);
      } catch (e) {
        Alert.alert('Error', 'Failed to load branches');
      } finally {
        setOptionsLoading(false);
      }
    } else if (type === 'assign') {
      setOptionsLoading(true);
      try {
        const res = await authFetch('/api/mobile/staff/ussd/teams');
        const data = await res.json();
        setTeams(data.success ? data.payload || [] : []);
      } catch (e) {
        Alert.alert('Error', 'Failed to load teams');
      } finally {
        setOptionsLoading(false);
      }
    }
  };

  const closeActionModal = () => {
    setActionModalVisible(false);
    setActionType(null);
    setSelectedRequest(null);
    setSelectedOptionId(null);
    setBranches([]);
    setTeams([]);
  };

  const submitAction = async () => {
    if (!selectedRequest || !actionType) return;

    let endpoint = '';
    const payload: Record<string, unknown> = {
      request_id: selectedRequest.id,
      request_type: 'registration',
    };

    if (actionType === 'allocate') {
      if (!selectedOptionId) {
        Alert.alert('Select a branch', 'Please choose a branch to allocate to.');
        return;
      }
      endpoint = '/api/mobile/staff/ussd/allocate-branch';
      payload.branch_id = selectedOptionId;
    } else if (actionType === 'assign') {
      if (!selectedOptionId) {
        Alert.alert('Select a team', 'Please choose a team to assign to.');
        return;
      }
      endpoint = '/api/mobile/staff/ussd/assign';
      payload.team_id = selectedOptionId;
      payload.user_id = null;
    } else if (actionType === 'process') {
      endpoint = '/api/mobile/staff/ussd/processed';
    }

    try {
      setSubmitting(true);
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Action failed');
      }

      closeActionModal();
      await fetchData(1);
      Alert.alert('Success', 'Request updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = (item: UssdRegistration, index: number) => {
    const colors = STATUS_COLORS[item.status] || { bg: '#F5F5F5', text: '#616161' };
    const actionLabel = ACTION_LABELS[item.status];
    return (
      <View key={item.id ?? index} style={styles.tableRow}>
        <Text style={[styles.tableCell, styles.dateCell]}>{formatDate(item.created_at)}</Text>
        <Text style={[styles.tableCell, styles.nameCell]} numberOfLines={2}>
          {getFirstTwoNames(item.name)}
        </Text>
        <Text style={[styles.tableCell, styles.phoneCell]}>{item.phone_number || '-'}</Text>
        <View style={styles.statusActionCell}>
          <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.statusText, { color: colors.text }]}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
          {actionLabel ? (
            <TouchableOpacity style={styles.actionButton} onPress={() => openActionModal(item)}>
              <Text style={styles.actionButtonText}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: screenTitle }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={ACCENT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {screenTitle}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {loading ? '...' : totalItems || registrations.length}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value;
          return (
            <TouchableOpacity
              key={f.label}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.value)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.dateCell]}>Date</Text>
        <Text style={[styles.headerCell, styles.nameCell]}>Name</Text>
        <Text style={[styles.headerCell, styles.phoneCell]}>Phone</Text>
        <Text style={[styles.headerCell, styles.statusActionHeaderCell]}>Status</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />
        }
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={ACCENT} size="large" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : registrations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#BDBDBD" />
            <Text style={styles.emptyText}>Nothing here right now</Text>
          </View>
        ) : (
          <>
            {registrations.map(renderRow)}
            {loadingMore && <ActivityIndicator style={{ marginVertical: 16 }} color={ACCENT} />}
          </>
        )}
      </ScrollView>

      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActionModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {actionType === 'allocate'
                  ? 'Allocate USSD Request'
                  : actionType === 'assign'
                  ? 'Assign USSD Request'
                  : 'Process USSD Request'}
              </Text>
              <TouchableOpacity onPress={closeActionModal}>
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {selectedRequest && (
              <View style={styles.detailsBox}>
                <Text style={styles.detailsBoxTitle}>Request Details</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name</Text>
                  <Text style={styles.detailValue}>{selectedRequest.name || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>{selectedRequest.phone_number || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Town</Text>
                  <Text style={styles.detailValue}>{selectedRequest.town || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Business</Text>
                  <Text style={styles.detailValue}>{selectedRequest.business_type || '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>USSD Ref</Text>
                  <Text style={styles.detailValue}>{selectedRequest.ussd_ref_code || '-'}</Text>
                </View>
              </View>
            )}

            {actionType === 'allocate' && (
              <View style={styles.pickerSection}>
                <Text style={styles.pickerLabel}>Branch</Text>
                {optionsLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />
                ) : (
                  <FlatList
                    data={branches}
                    keyExtractor={(b) => String(b.id)}
                    style={styles.pickerList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.pickerOption,
                          selectedOptionId === item.id && styles.pickerOptionSelected,
                        ]}
                        onPress={() => setSelectedOptionId(item.id)}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedOptionId === item.id && styles.pickerOptionTextSelected,
                          ]}
                        >
                          {item.name}
                        </Text>
                        {selectedOptionId === item.id && (
                          <Ionicons name="checkmark" size={18} color={ACCENT} />
                        )}
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyPickerText}>No branches found</Text>}
                  />
                )}
              </View>
            )}

            {actionType === 'assign' && (
              <View style={styles.pickerSection}>
                <Text style={styles.pickerLabel}>Team</Text>
                {optionsLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />
                ) : (
                  <FlatList
                    data={teams}
                    keyExtractor={(t) => String(t.id)}
                    style={styles.pickerList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.pickerOption,
                          selectedOptionId === item.id && styles.pickerOptionSelected,
                        ]}
                        onPress={() => setSelectedOptionId(item.id)}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedOptionId === item.id && styles.pickerOptionTextSelected,
                          ]}
                        >
                          {item.name}
                        </Text>
                        {selectedOptionId === item.id && (
                          <Ionicons name="checkmark" size={18} color={ACCENT} />
                        )}
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyPickerText}>No teams found</Text>}
                  />
                )}
              </View>
            )}

            {actionType === 'process' && (
              <View style={styles.processWarningBox}>
                <Ionicons name="warning-outline" size={18} color="#F57C00" />
                <Text style={styles.processWarningText}>
                  Marking as processed will remove this from the active queue.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={submitAction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {actionType === 'allocate'
                    ? 'Allocate to Branch'
                    : actionType === 'assign'
                    ? 'Assign to Team'
                    : 'Mark As Processed'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: { padding: 4, marginRight: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#000000' },
  countBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    minWidth: 32,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: 13, fontWeight: 'bold', color: ACCENT },

  filterRow: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  filterRowContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: ACCENT },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#616161' },
  filterChipTextActive: { color: '#FFFFFF' },

  container: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerCell: { fontSize: 12, fontWeight: '700', color: '#666' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    minHeight: 64,
  },
  tableCell: { fontSize: 13, color: '#333' },
  dateCell: { width: '20%', paddingRight: 4 },
  nameCell: { width: '28%', paddingRight: 4 },
  phoneCell: { width: '25%', paddingRight: 4 },
  statusActionCell: { width: '27%', gap: 6 },
  statusActionHeaderCell: { width: '27%' },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: { fontSize: 10, fontWeight: '600' },
  actionButton: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionButtonText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 13, color: '#9E9E9E', marginTop: 8 },
  errorText: { textAlign: 'center', color: 'red', marginTop: 40, paddingHorizontal: 20 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#000' },
  detailsBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    padding: 14,
    marginBottom: 14,
  },
  detailsBoxTitle: { fontSize: 13, fontWeight: '700', color: '#495057', marginBottom: 8 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: { fontSize: 12, fontWeight: '600', color: '#495057' },
  detailValue: { fontSize: 12, color: '#212529' },

  pickerSection: { marginBottom: 14 },
  pickerLabel: { fontSize: 12, fontWeight: '700', color: '#495057', marginBottom: 6 },
  pickerList: { maxHeight: 180, borderWidth: 1, borderColor: '#EEEEEE', borderRadius: 8 },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pickerOptionSelected: { backgroundColor: '#E3F2FD' },
  pickerOptionText: { fontSize: 13, color: '#333' },
  pickerOptionTextSelected: { color: ACCENT, fontWeight: '600' },
  emptyPickerText: { padding: 14, fontSize: 12, color: '#9E9E9E', textAlign: 'center' },

  processWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  processWarningText: { flex: 1, fontSize: 12, color: '#8A6D00' },

  submitButton: {
    backgroundColor: 'green',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
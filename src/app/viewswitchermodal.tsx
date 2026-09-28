import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useViewPreference } from '@/hooks/use-view-preference';

const ACCENT = '#2D5BFF';

type ViewType = 'all' | 'branch' | 'team';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function ViewSwitcherModal({ visible, onClose }: Props) {
  const { options, viewType, branchId, teamId, setView } = useViewPreference();

  // Local staging state so picking a branch/team doesn't apply until confirmed.
  const [pendingType, setPendingType] = useState<ViewType>(viewType ?? 'all');
  const [pendingBranchId, setPendingBranchId] = useState<number | null>(branchId);
  const [pendingTeamId, setPendingTeamId] = useState<number | null>(teamId);

  useEffect(() => {
    if (visible) {
      setPendingType(viewType ?? 'all');
      setPendingBranchId(branchId);
      setPendingTeamId(teamId);
    }
  }, [visible, viewType, branchId, teamId]);

  if (!options) return null;

  // The backend already scopes `options.teams` to what this role may switch to
  // (all teams for admin/hq/bm, own-branch teams for tl) — no client-side filtering needed.
  const availableTeams = options.teams || [];

  const canApply =
    pendingType === 'all' ||
    (pendingType === 'branch' && pendingBranchId != null) ||
    (pendingType === 'team' && (availableTeams.length === 0 || pendingTeamId != null));

  const handleApply = async () => {
    await setView(
      pendingType,
      pendingType === 'branch' ? pendingBranchId : null,
      pendingType === 'team' ? pendingTeamId : null
    );
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Switch View</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#616161" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {options.can_view_all && (
              <OptionRow
                label="All Branches"
                icon="globe-outline"
                selected={pendingType === 'all'}
                onPress={() => setPendingType('all')}
              />
            )}

            {options.can_switch_branch && (
              <>
                <OptionRow
                  label="Branch"
                  icon="business-outline"
                  selected={pendingType === 'branch'}
                  onPress={() => setPendingType('branch')}
                />
                {pendingType === 'branch' && (
                  <View style={styles.subList}>
                    {(options.branches || []).map((b) => (
                      <SubRow
                        key={b.id}
                        label={b.name}
                        selected={pendingBranchId === b.id}
                        onPress={() => setPendingBranchId(b.id)}
                      />
                    ))}
                    {(options.branches || []).length === 0 && (
                      <Text style={styles.emptyText}>No branches available</Text>
                    )}
                  </View>
                )}
              </>
            )}

            {options.can_switch_team && (
              <>
                <OptionRow
                  label="Team"
                  icon="people-outline"
                  selected={pendingType === 'team'}
                  onPress={() => setPendingType('team')}
                />
                {pendingType === 'team' && (
                  <View style={styles.subList}>
                    {availableTeams.map((t) => (
                      <SubRow
                        key={t.id}
                        label={t.name}
                        selected={pendingTeamId === t.id}
                        onPress={() => setPendingTeamId(t.id)}
                      />
                    ))}
                    {availableTeams.length === 0 && (
                      <Text style={styles.emptyText}>My Team (default)</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, !canApply && styles.applyButtonDisabled]}
              onPress={handleApply}
              disabled={!canApply}
            >
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OptionRow({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.optionRow, selected && styles.optionRowActive]} onPress={onPress}>
      <Ionicons name={icon} size={18} color={selected ? ACCENT : '#616161'} style={{ marginRight: 10 }} />
      <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={18} color={ACCENT} style={{ marginLeft: 'auto' }} />}
    </TouchableOpacity>
  );
}

function SubRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.subRow, selected && styles.subRowActive]} onPress={onPress}>
      <Text style={[styles.subRowText, selected && styles.subRowTextActive]}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={16} color={ACCENT} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#212121' },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  optionRowActive: { backgroundColor: '#E3F2FD' },
  optionLabel: { fontSize: 14, color: '#212121', fontWeight: '500' },
  optionLabelActive: { color: ACCENT },
  subList: { marginLeft: 28, marginBottom: 8 },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  subRowActive: { backgroundColor: '#F5F9FF' },
  subRowText: { fontSize: 13, color: '#616161' },
  subRowTextActive: { color: ACCENT, fontWeight: '600' },
  emptyText: { fontSize: 12, color: '#9e9e9e', fontStyle: 'italic', paddingVertical: 8, paddingHorizontal: 12 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: { color: '#616161', fontWeight: '600', fontSize: 14 },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: ACCENT,
  },
  applyButtonDisabled: { backgroundColor: '#B0C2FF' },
  applyButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
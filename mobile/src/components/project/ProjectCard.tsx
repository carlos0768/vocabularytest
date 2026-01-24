import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { BookOpen, MoreVertical, Trash2 } from 'lucide-react-native';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import colors from '../../constants/colors';
import { formatDate } from '../../lib/utils';
import type { Project } from '../../types';

interface ProjectCardProps {
  project: Project;
  wordCount: number;
  onPress: () => void;
  onDelete: () => void;
}

export function ProjectCard({
  project,
  wordCount,
  onPress,
  onDelete,
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleDelete = () => {
    setShowMenu(false);
    onDelete();
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <CardHeader style={styles.header}>
          <View style={styles.titleRow}>
            <CardTitle numberOfLines={2} style={styles.title}>
              {project.title}
            </CardTitle>
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              style={styles.menuButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MoreVertical size={20} color={colors.gray[400]} />
            </TouchableOpacity>
          </View>
        </CardHeader>
        <CardContent>
          <View style={styles.meta}>
            <View style={styles.wordCount}>
              <BookOpen size={16} color={colors.gray[500]} />
              <Text style={styles.metaText}>{wordCount}語</Text>
            </View>
            <Text style={styles.metaText}>{formatDate(project.createdAt)}</Text>
          </View>
        </CardContent>
      </Card>

      {/* Dropdown Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleDelete}
            >
              <Trash2 size={18} color={colors.red[600]} />
              <Text style={styles.menuItemText}>削除</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  header: {
    paddingRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    paddingRight: 8,
  },
  menuButton: {
    padding: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  wordCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: colors.red[600],
    fontWeight: '500',
  },
});

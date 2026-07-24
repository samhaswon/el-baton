#pragma once

#include "workspace_repository.h"

#include <QHash>
#include <QPointF>
#include <QTimer>
#include <QWidget>

namespace qt_editor {

class WorkspaceGraphView final : public QWidget {
  Q_OBJECT

 public:
  explicit WorkspaceGraphView(QWidget* parent = nullptr);

  void setGraph(const WorkspaceGraph& graph);
  void setSearchQuery(const QString& query);
  void setNodeKindsVisible(bool notes, bool tags, bool attachments);
  void setLinkStatesVisible(bool linked, bool unlinked);
  void setCollisionRadius(double radius);
  void setLinkStrength(double strength);
  void setRepulsionStrength(double strength);
  void reheat();
  void fitToView();
  void zoomBy(double factor);
  [[nodiscard]] bool saveImage(const QString& filePath);

 signals:
  void nodeSelected(const WorkspaceGraphNode& node, int connections);
  void nodeActivated(const WorkspaceGraphNode& node);
  void visibleCountsChanged(int nodes, int edges);

 protected:
  void paintEvent(QPaintEvent* event) override;
  void resizeEvent(QResizeEvent* event) override;
  void showEvent(QShowEvent* event) override;
  void hideEvent(QHideEvent* event) override;
  void mousePressEvent(QMouseEvent* event) override;
  void mouseMoveEvent(QMouseEvent* event) override;
  void mouseReleaseEvent(QMouseEvent* event) override;
  void mouseDoubleClickEvent(QMouseEvent* event) override;
  void wheelEvent(QWheelEvent* event) override;

 private:
  struct NodeState final {
    WorkspaceGraphNode node;
    QPointF position;
    QPointF velocity;
    int connections = 0;
    bool visible = true;
  };

  void rebuildVisibility();
  void simulationStep();
  [[nodiscard]] QPointF toScreen(const QPointF& world) const;
  [[nodiscard]] QPointF toWorld(const QPointF& screen) const;
  [[nodiscard]] int nodeAt(const QPointF& screen) const;
  [[nodiscard]] QColor nodeColor(WorkspaceGraphNodeKind kind) const;

  QVector<NodeState> nodes_;
  QVector<WorkspaceGraphEdge> edges_;
  QVector<int> visibleNodeIndexes_;
  QVector<int> visibleEdgeIndexes_;
  QHash<QString, int> nodeIndexes_;
  QTimer simulationTimer_;
  QString searchQuery_;
  QPointF pan_;
  QPointF lastPointer_;
  double zoom_ = 1.0;
  double collisionRadius_ = 16.0;
  double linkStrength_ = 0.045;
  double repulsionStrength_ = 900.0;
  int simulationSteps_ = 0;
  int hoveredNode_ = -1;
  int selectedNode_ = -1;
  bool notesVisible_ = true;
  bool tagsVisible_ = true;
  bool attachmentsVisible_ = true;
  bool linkedVisible_ = true;
  bool unlinkedVisible_ = true;
  bool panning_ = false;
  bool simulationPending_ = false;
};

}  // namespace qt_editor

#include "workspace_graph_view.h"

#include <QHideEvent>
#include <QMouseEvent>
#include <QPainter>
#include <QPaintEvent>
#include <QResizeEvent>
#include <QShowEvent>
#include <QWheelEvent>

#include <algorithm>
#include <cmath>

namespace qt_editor {
namespace {

double vectorLength(const QPointF& value) {
  return std::sqrt(value.x() * value.x() + value.y() * value.y());
}

}  // namespace

WorkspaceGraphView::WorkspaceGraphView(QWidget* parent) : QWidget(parent) {
  setObjectName(QStringLiteral("workspaceGraph"));
  setMinimumSize(320, 240);
  setMouseTracking(true);
  setFocusPolicy(Qt::StrongFocus);
  simulationTimer_.setInterval(16);
  connect(&simulationTimer_, &QTimer::timeout, this, &WorkspaceGraphView::simulationStep);
}

void WorkspaceGraphView::setGraph(const WorkspaceGraph& graph) {
  QHash<QString, QPointF> oldPositions;
  for (const NodeState& state : nodes_) oldPositions.insert(state.node.id, state.position);

  nodes_.clear();
  edges_ = graph.edges;
  nodeIndexes_.clear();
  nodes_.reserve(graph.nodes.size());
  for (int index = 0; index < graph.nodes.size(); ++index) {
    const WorkspaceGraphNode& node = graph.nodes.at(index);
    const quint64 hash = qHash(node.id);
    const double angle = static_cast<double>(hash % 6283U) / 1000.0;
    const double radius = 36.0 + static_cast<double>((hash / 6283U) % 460U);
    const QPointF initial(std::cos(angle) * radius, std::sin(angle) * radius);
    nodes_.append({node, oldPositions.value(node.id, initial), {}, 0, true});
    nodeIndexes_.insert(node.id, index);
  }
  for (const WorkspaceGraphEdge& edge : edges_) {
    const auto source = nodeIndexes_.constFind(edge.sourceId);
    const auto target = nodeIndexes_.constFind(edge.targetId);
    if (source != nodeIndexes_.cend()) ++nodes_[source.value()].connections;
    if (target != nodeIndexes_.cend()) ++nodes_[target.value()].connections;
  }
  selectedNode_ = -1;
  hoveredNode_ = -1;
  rebuildVisibility();
}

void WorkspaceGraphView::setSearchQuery(const QString& query) {
  searchQuery_ = query.trimmed();
  rebuildVisibility();
}

void WorkspaceGraphView::setNodeKindsVisible(bool notes, bool tags, bool attachments) {
  notesVisible_ = notes;
  tagsVisible_ = tags;
  attachmentsVisible_ = attachments;
  rebuildVisibility();
}

void WorkspaceGraphView::setLinkStatesVisible(bool linked, bool unlinked) {
  linkedVisible_ = linked;
  unlinkedVisible_ = unlinked;
  rebuildVisibility();
}

void WorkspaceGraphView::setCollisionRadius(double radius) {
  collisionRadius_ = std::clamp(radius, 4.0, 64.0);
  reheat();
}

void WorkspaceGraphView::setLinkStrength(double strength) {
  linkStrength_ = std::clamp(strength, 0.0, 0.2);
  reheat();
}

void WorkspaceGraphView::setRepulsionStrength(double strength) {
  repulsionStrength_ = std::clamp(strength, 0.0, 4000.0);
  reheat();
}

void WorkspaceGraphView::reheat() {
  simulationSteps_ = 0;
  const int visibleCount = static_cast<int>(visibleNodeIndexes_.size());
  simulationTimer_.setInterval(visibleCount > 1200 ? 30 : visibleCount > 500 ? 22 : 16);
  simulationPending_ = !visibleNodeIndexes_.isEmpty();
  if (simulationPending_ && isVisible()) {
    simulationPending_ = false;
    simulationTimer_.start();
  } else {
    simulationTimer_.stop();
  }
  update();
}

void WorkspaceGraphView::fitToView() {
  QRectF bounds;
  bool found = false;
  for (const NodeState& state : nodes_) {
    if (!state.visible) continue;
    if (!found) {
      bounds = QRectF(state.position, QSizeF(1.0, 1.0));
      found = true;
    } else {
      bounds |= QRectF(state.position, QSizeF(1.0, 1.0));
    }
  }
  if (!found) return;
  bounds = bounds.adjusted(-35.0, -35.0, 35.0, 35.0);
  const double horizontal = static_cast<double>(width()) / std::max(1.0, bounds.width());
  const double vertical = static_cast<double>(height()) / std::max(1.0, bounds.height());
  zoom_ = std::clamp(std::min(horizontal, vertical) * 0.92, 0.08, 8.0);
  pan_ = -bounds.center() * zoom_;
  update();
}

void WorkspaceGraphView::zoomBy(double factor) {
  zoom_ = std::clamp(zoom_ * factor, 0.08, 8.0);
  update();
}

bool WorkspaceGraphView::saveImage(const QString& filePath) {
  return grab().save(filePath);
}

void WorkspaceGraphView::rebuildVisibility() {
  int visibleNodes = 0;
  visibleNodeIndexes_.clear();
  visibleEdgeIndexes_.clear();
  for (int index = 0; index < nodes_.size(); ++index) {
    NodeState& state = nodes_[index];
    const bool kindVisible = state.node.kind == WorkspaceGraphNodeKind::Note ? notesVisible_
        : state.node.kind == WorkspaceGraphNodeKind::Tag ? tagsVisible_
        : attachmentsVisible_;
    const bool linkVisible = state.connections > 0 ? linkedVisible_ : unlinkedVisible_;
    const bool searchVisible = searchQuery_.isEmpty() ||
        state.node.label.contains(searchQuery_, Qt::CaseInsensitive) ||
        state.node.detail.contains(searchQuery_, Qt::CaseInsensitive);
    state.visible = kindVisible && linkVisible && searchVisible;
    if (state.visible) {
      ++visibleNodes;
      visibleNodeIndexes_.append(index);
    }
  }
  int visibleEdges = 0;
  for (int edgeIndex = 0; edgeIndex < edges_.size(); ++edgeIndex) {
    const WorkspaceGraphEdge& edge = edges_.at(edgeIndex);
    const auto source = nodeIndexes_.constFind(edge.sourceId);
    const auto target = nodeIndexes_.constFind(edge.targetId);
    if (source != nodeIndexes_.cend() && target != nodeIndexes_.cend() &&
        nodes_.at(source.value()).visible && nodes_.at(target.value()).visible) {
      ++visibleEdges;
      visibleEdgeIndexes_.append(edgeIndex);
    }
  }
  if (selectedNode_ >= 0 && !nodes_.at(selectedNode_).visible) selectedNode_ = -1;
  emit visibleCountsChanged(visibleNodes, visibleEdges);
  reheat();
}

void WorkspaceGraphView::simulationStep() {
  const int visibleCount = static_cast<int>(visibleNodeIndexes_.size());
  const int stepLimit = visibleCount > 1500 ? 80 : visibleCount > 800 ? 120
      : visibleCount > 300 ? 180 : 260;
  if (visibleNodeIndexes_.isEmpty() || ++simulationSteps_ > stepLimit) {
    simulationTimer_.stop();
    simulationPending_ = false;
    return;
  }

  QVector<QPointF> forces(nodes_.size());
  const int sampleLimit = visibleCount > 1500 ? 8 : visibleCount > 800 ? 12
      : visibleCount > 300 ? 24 : 48;
  const int samples = std::min(sampleLimit, std::max(0, visibleCount - 1));
  for (int visibleIndex = 0; visibleIndex < visibleCount; ++visibleIndex) {
    const int index = visibleNodeIndexes_.at(visibleIndex);
    forces[index] -= nodes_.at(index).position * 0.0008;
    for (int sample = 1; sample <= samples; ++sample) {
      const int otherVisible = (visibleIndex + sample * 7919) % visibleCount;
      if (otherVisible == visibleIndex) continue;
      const int other = visibleNodeIndexes_.at(otherVisible);
      QPointF delta = nodes_.at(index).position - nodes_.at(other).position;
      double distance = vectorLength(delta);
      if (distance < 0.1) {
        delta = QPointF(0.1 * (sample + 1), 0.17 * (visibleIndex + 1));
        distance = vectorLength(delta);
      }
      const double collision = std::max(0.0, collisionRadius_ - distance) * 0.24;
      const double repulsion = repulsionStrength_ / std::max(36.0, distance * distance);
      forces[index] += delta / distance * (repulsion + collision);
    }
  }

  for (const int edgeIndex : visibleEdgeIndexes_) {
    const WorkspaceGraphEdge& edge = edges_.at(edgeIndex);
    const auto source = nodeIndexes_.constFind(edge.sourceId);
    const auto target = nodeIndexes_.constFind(edge.targetId);
    if (source == nodeIndexes_.cend() || target == nodeIndexes_.cend()) continue;
    const int sourceIndex = source.value();
    const int targetIndex = target.value();
    if (!nodes_.at(sourceIndex).visible || !nodes_.at(targetIndex).visible) continue;
    const QPointF delta = nodes_.at(targetIndex).position - nodes_.at(sourceIndex).position;
    const double distance = std::max(0.1, vectorLength(delta));
    const double pull = (distance - 92.0) * linkStrength_;
    const QPointF force = delta / distance * pull;
    forces[sourceIndex] += force;
    forces[targetIndex] -= force;
  }

  double energy = 0.0;
  for (const int index : visibleNodeIndexes_) {
    NodeState& state = nodes_[index];
    state.velocity = (state.velocity + forces.at(index)) * 0.82;
    const double speed = vectorLength(state.velocity);
    if (speed > 9.0) state.velocity *= 9.0 / speed;
    state.position += state.velocity;
    energy += vectorLength(state.velocity);
  }
  if (simulationSteps_ > 30 && energy < static_cast<double>(visibleCount) * 0.02) {
    simulationTimer_.stop();
    simulationPending_ = false;
  }
  update();
}

QPointF WorkspaceGraphView::toScreen(const QPointF& world) const {
  return QPointF(width() / 2.0, height() / 2.0) + pan_ + world * zoom_;
}

QPointF WorkspaceGraphView::toWorld(const QPointF& screen) const {
  return (screen - QPointF(width() / 2.0, height() / 2.0) - pan_) / zoom_;
}

int WorkspaceGraphView::nodeAt(const QPointF& screen) const {
  int closest = -1;
  double closestDistance = 14.0;
  for (const int index : visibleNodeIndexes_) {
    const double distance = vectorLength(toScreen(nodes_.at(index).position) - screen);
    if (distance < closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  }
  return closest;
}

QColor WorkspaceGraphView::nodeColor(const WorkspaceGraphNodeKind kind) const {
  if (kind == WorkspaceGraphNodeKind::Tag) return QColor(QStringLiteral("#ff5d62"));
  if (kind == WorkspaceGraphNodeKind::Attachment) return QColor(QStringLiteral("#38a7e8"));
  return QColor(QStringLiteral("#f4f4f4"));
}

void WorkspaceGraphView::paintEvent(QPaintEvent* event) {
  Q_UNUSED(event)
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing, visibleNodeIndexes_.size() <= 1200);
  painter.fillRect(rect(), QColor(QStringLiteral("#202020")));

  painter.setPen(QPen(QColor(255, 255, 255, 24), 1.0));
  for (const int edgeIndex : visibleEdgeIndexes_) {
    const WorkspaceGraphEdge& edge = edges_.at(edgeIndex);
    const auto source = nodeIndexes_.constFind(edge.sourceId);
    const auto target = nodeIndexes_.constFind(edge.targetId);
    if (source == nodeIndexes_.cend() || target == nodeIndexes_.cend()) continue;
    const NodeState& sourceState = nodes_.at(source.value());
    const NodeState& targetState = nodes_.at(target.value());
    painter.drawLine(toScreen(sourceState.position), toScreen(targetState.position));
  }

  for (const int index : visibleNodeIndexes_) {
    const NodeState& state = nodes_.at(index);
    const QPointF center = toScreen(state.position);
    const double radius = index == selectedNode_ ? 6.5 : index == hoveredNode_ ? 5.5 : 3.2;
    painter.setPen(index == selectedNode_ ? QPen(Qt::white, 1.5) : Qt::NoPen);
    painter.setBrush(nodeColor(state.node.kind));
    painter.drawEllipse(center, radius, radius);
  }

  const int labelIndex = hoveredNode_ >= 0 ? hoveredNode_ : selectedNode_;
  if (labelIndex >= 0 && labelIndex < nodes_.size() && nodes_.at(labelIndex).visible) {
    const NodeState& state = nodes_.at(labelIndex);
    const QPointF center = toScreen(state.position);
    QFont labelFont = painter.font();
    labelFont.setBold(true);
    painter.setFont(labelFont);
    const QFontMetrics metrics(labelFont);
    const QRect textBounds = metrics.boundingRect(state.node.label).adjusted(-7, -4, 7, 4);
    QRectF labelRect(center.x() + 10.0, center.y() - textBounds.height() / 2.0,
                     textBounds.width(), textBounds.height());
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(12, 12, 12, 220));
    painter.drawRoundedRect(labelRect, 4.0, 4.0);
    painter.setPen(QColor(QStringLiteral("#f4f4f4")));
    painter.drawText(labelRect, Qt::AlignCenter, state.node.label);
  }
}

void WorkspaceGraphView::resizeEvent(QResizeEvent* event) {
  QWidget::resizeEvent(event);
  update();
}

void WorkspaceGraphView::showEvent(QShowEvent* event) {
  QWidget::showEvent(event);
  if (simulationPending_ && !visibleNodeIndexes_.isEmpty()) {
    simulationPending_ = false;
    simulationTimer_.start();
  }
}

void WorkspaceGraphView::hideEvent(QHideEvent* event) {
  simulationPending_ = simulationPending_ || simulationTimer_.isActive();
  simulationTimer_.stop();
  QWidget::hideEvent(event);
}

void WorkspaceGraphView::mousePressEvent(QMouseEvent* event) {
  if (event->button() != Qt::LeftButton) return QWidget::mousePressEvent(event);
  lastPointer_ = event->position();
  const int hit = nodeAt(event->position());
  if (hit >= 0) {
    selectedNode_ = hit;
    emit nodeSelected(nodes_.at(hit).node, nodes_.at(hit).connections);
    update();
  } else {
    panning_ = true;
    setCursor(Qt::ClosedHandCursor);
  }
  event->accept();
}

void WorkspaceGraphView::mouseMoveEvent(QMouseEvent* event) {
  if (panning_) {
    pan_ += event->position() - lastPointer_;
    lastPointer_ = event->position();
    update();
  } else {
    const int previous = hoveredNode_;
    hoveredNode_ = nodeAt(event->position());
    setCursor(hoveredNode_ >= 0 ? Qt::PointingHandCursor : Qt::ArrowCursor);
    if (previous != hoveredNode_) update();
  }
  event->accept();
}

void WorkspaceGraphView::mouseReleaseEvent(QMouseEvent* event) {
  if (event->button() == Qt::LeftButton) {
    panning_ = false;
    setCursor(hoveredNode_ >= 0 ? Qt::PointingHandCursor : Qt::ArrowCursor);
    event->accept();
    return;
  }
  QWidget::mouseReleaseEvent(event);
}

void WorkspaceGraphView::mouseDoubleClickEvent(QMouseEvent* event) {
  const int hit = nodeAt(event->position());
  if (hit >= 0) emit nodeActivated(nodes_.at(hit).node);
  event->accept();
}

void WorkspaceGraphView::wheelEvent(QWheelEvent* event) {
  const QPointF before = toWorld(event->position());
  const double factor = std::pow(1.0015, event->angleDelta().y());
  zoom_ = std::clamp(zoom_ * factor, 0.08, 8.0);
  const QPointF after = toWorld(event->position());
  pan_ += (after - before) * zoom_;
  update();
  event->accept();
}

}  // namespace qt_editor

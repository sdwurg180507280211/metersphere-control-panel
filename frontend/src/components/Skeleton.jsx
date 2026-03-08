import './Skeleton.css'

export function Skeleton({ width, height, circle, className = '' }) {
  const style = {
    width: width || '100%',
    height: height || '16px'
  }

  if (circle) {
    style.borderRadius = '50%'
    style.width = width || height || '40px'
    style.height = height || width || '40px'
  }

  return (
    <div className={`skeleton ${className}`} style={style}>
      <div className="skeleton-shimmer" />
    </div>
  )
}

export function ServiceCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-header">
        <Skeleton circle width={40} height={40} />
        <div className="skeleton-card-info">
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton width="100%" height={60} />
    </div>
  )
}

export function ModuleButtonSkeleton() {
  return (
    <div className="skeleton-module-btn">
      <Skeleton width={80} height={32} />
    </div>
  )
}

export function LogViewerSkeleton() {
  return (
    <div className="skeleton-log">
      <div className="skeleton-log-toolbar">
        <Skeleton width={100} height={28} />
        <Skeleton width={200} height={28} />
      </div>
      <div className="skeleton-log-content">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} width={`${80 + Math.random() * 20}%`} height={16} />
        ))}
      </div>
    </div>
  )
}

export function BuildProgressSkeleton() {
  return (
    <div className="skeleton-build-item">
      <Skeleton circle width={32} height={32} />
      <div className="skeleton-build-content">
        <Skeleton width="40%" height={14} />
        <Skeleton width="100%" height={4} />
      </div>
    </div>
  )
}

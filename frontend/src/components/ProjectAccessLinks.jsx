import { canVisitAccessLink } from '../commandState'
import './ProjectAccessLinks.css'

export default function ProjectAccessLinks({ project, status, busy, onVisit }) {
  if (!project.accessLinks?.length) return null
  const groups = new Map()
  for (const link of project.accessLinks) {
    const name = link.group || '页面入口'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(link)
  }
  return (
    <section className="console-access-links" aria-label="项目页面入口">
      {[...groups].map(([name, links]) => (
        <section className="console-access-group" key={name}>
          <h2>{name}</h2>
          <div className="console-access-grid">
            {links.map((link, index) => {
              const available = canVisitAccessLink(project, status, link, busy)
              return <button key={`${link.url}-${index}`} className="console-access-link" disabled={!available} onClick={() => onVisit(link)} title={available ? link.url : '启动本地项目后可访问'}>
                <span>{link.label}<i aria-hidden="true">↗</i></span>
                <small>{link.url}</small>
              </button>
            })}
          </div>
        </section>
      ))}
    </section>
  )
}

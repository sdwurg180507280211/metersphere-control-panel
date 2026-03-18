import { useState, useEffect, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'
import PasswordDialog from './PasswordDialog'
import './PropertiesDialog.css'

function PropertiesDialog({ onClose }) {
  const [activeTab, setActiveTab] = useState('metersphere.properties')
  const [contents, setContents] = useState({
    'metersphere.properties': '',
    'redisson.yml': ''
  })
  const [initialContents, setInitialContents] = useState({
    'metersphere.properties': '',
    'redisson.yml': ''
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Password dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'read' | 'write'
  
  // Search and replace state
  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('properties_search_term') || '')
  const [replaceTerm, setReplaceTerm] = useState(() => localStorage.getItem('properties_replace_term') || '')
  const [searchResults, setSearchResults] = useState([])
  const [currentResultIndex, setCurrentResultIndex] = useState(-1)
  
  const textareaRef = useRef(null)
  const highlightLayerRef = useRef(null)
  const searchInputRef = useRef(null)
  const shouldFocusEditorRef = useRef(false)

  const activeContent = contents[activeTab] || ''
  const highlightedContent = useMemo(() => (
    buildHighlightedHtml(activeContent, searchResults, currentResultIndex, searchTerm)
  ), [activeContent, currentResultIndex, searchResults, searchTerm])

  useEffect(() => {
    fetchProperties(activeTab)
  }, [activeTab])

  // 保存草稿到 localStorage
  useEffect(() => {
    if (contents[activeTab] !== initialContents[activeTab]) {
      localStorage.setItem(`properties_draft_${activeTab}`, contents[activeTab])
    }
  }, [contents, activeTab, initialContents])

  // 保存搜索内容到 localStorage
  useEffect(() => {
    localStorage.setItem('properties_search_term', searchTerm)
  }, [searchTerm])

  useEffect(() => {
    localStorage.setItem('properties_replace_term', replaceTerm)
  }, [replaceTerm])

  const fetchProperties = async (filename) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/config/properties/${filename}`)
      const data = await res.json()
      if (data.success) {
        const draft = localStorage.getItem(`properties_draft_${filename}`)
        const content = draft || data.data.content
        setContents(prev => ({ ...prev, [filename]: content }))
        setInitialContents(prev => ({ ...prev, [filename]: data.data.content }))
        if (draft) {
          toast.success('已恢复上次未保存的编辑', { icon: '📝' })
        }
      } else if (data.code === 'EACCES') {
        setPendingAction('read')
        setShowPasswordDialog(true)
      } else {
        toast.error(data.message || `获取 ${filename} 失败`)
      }
    } catch (err) {
      toast.error(`请求失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/config/properties/${activeTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contents[activeTab] })
      })
      const data = await res.json()
      if (data.success) {
        setInitialContents(prev => ({ ...prev, [activeTab]: contents[activeTab] }))
        localStorage.removeItem(`properties_draft_${activeTab}`)
        toast.success(`${activeTab} 保存成功`)
      } else if (data.code === 'EACCES') {
        setPendingAction('write')
        setShowPasswordDialog(true)
      } else {
        toast.error(data.message || '保存失败')
      }
    } catch (err) {
      toast.error(`保存失败: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    setContents(prev => ({ ...prev, [activeTab]: e.target.value }))
  }

  const handlePasswordConfirm = async () => {
    if (!password) {
      setPasswordError('请输入管理员密码')
      return
    }

    setPasswordLoading(true)
    setPasswordError('')

    try {
      if (pendingAction === 'read') {
        const res = await fetch(`/api/config/properties/${activeTab}/sudo-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        })
        const data = await res.json()
        if (data.success) {
          setContents(prev => ({ ...prev, [activeTab]: data.data.content }))
          setInitialContents(prev => ({ ...prev, [activeTab]: data.data.content }))
          localStorage.removeItem(`properties_draft_${activeTab}`)
          setShowPasswordDialog(false)
          setPassword('')
          toast.success('读取成功')
        } else {
          setPasswordError(data.message || '读取失败')
        }
      } else if (pendingAction === 'write') {
        const res = await fetch(`/api/config/properties/${activeTab}/sudo-write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: contents[activeTab], password })
        })
        const data = await res.json()
        if (data.success) {
          setInitialContents(prev => ({ ...prev, [activeTab]: contents[activeTab] }))
          localStorage.removeItem(`properties_draft_${activeTab}`)
          setShowPasswordDialog(false)
          setPassword('')
          toast.success('保存成功')
        } else {
          setPasswordError(data.message || '保存失败')
        }
      }
    } catch (err) {
      setPasswordError(`操作失败: ${err.message}`)
    } finally {
      setPasswordLoading(false)
    }
  }

  const handlePasswordCancel = () => {
    setShowPasswordDialog(false)
    setPassword('')
    setPasswordError('')
    setPendingAction(null)
  }

  // Handle Tab indentation
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = target.value.substring(0, start) + "\t" + target.value.substring(end);
      setContents(prev => ({ ...prev, [activeTab]: newValue }));
      
      // Update cursor position after state changes
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 1;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }

  // Effect to update search results when content or search term changes
  useEffect(() => {
    if (!showSearch || !searchTerm) {
      setSearchResults([])
      setCurrentResultIndex(-1)
      shouldFocusEditorRef.current = false
      return
    }

    const text = activeContent
    const results = []
    let i = -1
    while ((i = text.indexOf(searchTerm, i + 1)) >= 0) {
      results.push(i)
    }

    setSearchResults(results)
    if (results.length > 0) {
      if (currentResultIndex >= results.length || currentResultIndex === -1) {
        setCurrentResultIndex(0)
      }
    } else {
      setCurrentResultIndex(-1)
    }
  }, [activeContent, searchTerm, showSearch])

  // Scroll to current search result
  useEffect(() => {
    if (searchResults.length > 0 && currentResultIndex >= 0 && textareaRef.current) {
      const textarea = textareaRef.current
      const pos = searchResults[currentResultIndex]
      if (shouldFocusEditorRef.current) {
        textarea.focus()
      }
      textarea.setSelectionRange(pos, pos + searchTerm.length)
      
      // Calculate scroll position vertically roughly
      const textBefore = activeContent.substring(0, pos)
      const lineCount = textBefore.split('\n').length
      
      const lineHeightMatch = window.getComputedStyle(textarea).lineHeight
      const lineHeight = parseFloat(lineHeightMatch) || 20
      
      // Keep selected line roughly in the middle
      textarea.scrollTop = Math.max(0, (lineCount * lineHeight) - (textarea.clientHeight / 2))

      syncHighlightScroll(textarea)
      shouldFocusEditorRef.current = false
    }
  }, [activeContent, currentResultIndex, searchResults, searchTerm])

  const syncHighlightScroll = (source) => {
    if (!source || !highlightLayerRef.current) return

    highlightLayerRef.current.scrollTop = source.scrollTop
    highlightLayerRef.current.scrollLeft = source.scrollLeft
  }

  const handleEditorScroll = (event) => {
    syncHighlightScroll(event.target)
  }

  const handleNextMatch = () => {
    if (searchResults.length === 0) return
    shouldFocusEditorRef.current = false
    setCurrentResultIndex((prev) => (prev + 1) % searchResults.length)
  }

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return
    shouldFocusEditorRef.current = false
    setCurrentResultIndex((prev) => (prev === 0 ? searchResults.length - 1 : prev - 1))
  }

  const handleReplace = () => {
    if (searchResults.length === 0 || currentResultIndex === -1) return
    
    const textarea = textareaRef.current
    if (textarea) {
      const pos = searchResults[currentResultIndex]
      shouldFocusEditorRef.current = true
      textarea.focus()
      textarea.setSelectionRange(pos, pos + searchTerm.length)
      document.execCommand('insertText', false, replaceTerm)
    }
  }

  const handleReplaceAll = () => {
    if (!searchTerm) return
    
    const text = activeContent
    const newText = text.split(searchTerm).join(replaceTerm)
    
    const textarea = textareaRef.current
    if (textarea) {
      shouldFocusEditorRef.current = true
      textarea.focus()
      textarea.select()
      document.execCommand('insertText', false, newText)
    } else {
      setContents(prev => ({ ...prev, [activeTab]: newText }))
    }
  }

  const closeSearch = () => {
    setShowSearch(false)
    shouldFocusEditorRef.current = true
    textareaRef.current?.focus()
  }

  const hasUnsavedChanges = contents[activeTab] !== initialContents[activeTab]

  const handleTabChange = (tabName) => {
    if (activeTab === tabName) return;
    if (hasUnsavedChanges && !window.confirm(`[${activeTab}] 有未保存的修改，确定要丢弃并切换视图吗？`)) {
      return;
    }
    setActiveTab(tabName);
  }

  const handleClose = () => {
    const anyUnsaved = Object.keys(contents).some(key => contents[key] !== initialContents[key]);
    if (anyUnsaved && !window.confirm('当前配置有未保存的修改，确定要丢弃并关闭吗？')) {
      return;
    }
    onClose();
  }

  return (
    <>
      <div className="log-modal-overlay" onClick={handleClose}>
        <div className="log-modal properties-modal" onClick={e => e.stopPropagation()}>
          <div className="log-modal-header">
            <h3>MeterSphere 配置文件</h3>
            <button className="log-modal-close" onClick={handleClose}>✕</button>
          </div>
        <div className="properties-tabs">
          <button 
            className={`properties-tab ${activeTab === 'metersphere.properties' ? 'active' : ''}`}
            onClick={() => handleTabChange('metersphere.properties')}
          >
            metersphere.properties
            {contents['metersphere.properties'] !== initialContents['metersphere.properties'] && ' *'}
          </button>
          <button 
            className={`properties-tab ${activeTab === 'redisson.yml' ? 'active' : ''}`}
            onClick={() => handleTabChange('redisson.yml')}
          >
            redisson.yml
            {contents['redisson.yml'] !== initialContents['redisson.yml'] && ' *'}
          </button>
        </div>
        
        {showSearch && (
          <div className="properties-search-bar">
            <div className="search-group">
              <div className="search-input-wrapper">
                <input 
                  ref={searchInputRef}
                  className="search-input"
                  placeholder="查找..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      handleNextMatch()
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      handlePrevMatch()
                    }
                  }}
                />
                {searchTerm && (
                  <button type="button" className="search-input-clear" onClick={() => setSearchTerm('')}>✕</button>
                )}
              </div>
              <span className="search-stats">
                {searchResults.length > 0 ? `${currentResultIndex + 1} / ${searchResults.length}` : '0 / 0'}
              </span>
              <button className="search-btn" onClick={handlePrevMatch} disabled={searchResults.length === 0} title="上一处 (Up Arrow)">↑</button>
              <button className="search-btn" onClick={handleNextMatch} disabled={searchResults.length === 0} title="下一处 (Down Arrow or Enter)">↓</button>
            </div>
            
            <div className="search-group">
              <div className="search-input-wrapper">
                <input 
                  className="search-input"
                  placeholder="替换为..." 
                  value={replaceTerm}
                  onChange={e => setReplaceTerm(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleReplace()
                    }
                  }}
                />
                {replaceTerm && (
                  <button type="button" className="search-input-clear" onClick={() => setReplaceTerm('')}>✕</button>
                )}
              </div>
              <button className="search-btn-text" onClick={handleReplace} disabled={searchResults.length === 0}>替换</button>
              <button className="search-btn-text" onClick={handleReplaceAll} disabled={searchResults.length === 0}>全部替换</button>
            </div>
            
            <button className="search-close-btn" onClick={closeSearch}>✕</button>
          </div>
        )}

        <div className="log-modal-body properties-body">
          {loading && !activeContent ? (
            <div className="properties-loading">正在加载...</div>
          ) : (
            <div className="properties-editor-shell">
              <pre
                ref={highlightLayerRef}
                className="properties-highlight-layer"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightedContent }}
              />
              <textarea 
                ref={textareaRef}
                className="properties-editor"
                value={activeContent}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onScroll={handleEditorScroll}
                spellCheck={false}
                wrap="off"
              />
            </div>
          )}
        </div>
        <div className="properties-footer">
          <button className="properties-btn-cancel" onClick={handleClose}>关闭</button>
          <button className="properties-btn-save" onClick={handleSave} disabled={loading || saving || !hasUnsavedChanges}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      </div>

      <PasswordDialog
        isOpen={showPasswordDialog}
        title="需要管理员权限"
        description={`${pendingAction === 'read' ? '读取' : '写入'}配置文件需要管理员权限，请输入密码以继续。`}
        value={password}
        error={passwordError}
        loading={passwordLoading}
        onChange={setPassword}
        onConfirm={handlePasswordConfirm}
        onCancel={handlePasswordCancel}
      />
    </>
  )
}

export default PropertiesDialog

function buildHighlightedHtml(text, results, currentResultIndex, searchTerm) {
  const source = text || ''
  const escapedSource = escapeHtml(source)

  if (!searchTerm || !results.length || currentResultIndex < 0) {
    return `${escapedSource || '&nbsp;'}
`
  }

  const currentStart = results[currentResultIndex]
  const currentEnd = currentStart + searchTerm.length

  return `${escapeHtml(source.slice(0, currentStart))}<mark class="properties-highlight-current">${escapeHtml(source.slice(currentStart, currentEnd))}</mark>${escapeHtml(source.slice(currentEnd))}
`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

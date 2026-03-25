from html.parser import HTMLParser

class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.divs = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'div': self.divs += 1
    def handle_endtag(self, tag):
        if tag == 'div': self.divs -= 1

new_body = """
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-1 flex flex-col gap-4">
                  <div className="card h-full">
                    <div className="card-header">
                      <h3 className="card-title">수신 그룹 (Send Groups)</h3>
                    </div>
                    <div className="card-body p-0">
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        <li>
                          <button
                            data-testid="group-select-all"
                            className={`w-full text-left p-3 border-b border-light flex justify-between items-center ${!selectedGroupId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            style={{ background: !selectedGroupId ? 'var(--bg-sidebar-active)' : 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
                            onClick={() => setSelectedGroupId(null)}
                          >
                            <span style={{ fontWeight: !selectedGroupId ? 'bold' : 'normal' }}>전체 구독자</span>
                            <span className="badge badge-neutral">{allCount}</span>
                          </button>
                        </li>
                        {isLoadingGroups ? (
                          <li className="p-3 text-secondary text-sm">그룹을 불러오는 중...</li>
                        ) : subscriberGroups.length === 0 ? (
                          <li className="p-3 text-secondary text-sm">등록된 그룹이 없습니다.</li>
                        ) : (
                          subscriberGroups.map((g) => {
                            const memberCount = subscribers.filter(s => s.groups.some(sg => sg.id === g.id)).length;
                            const isSelected = selectedGroupId === g.id;
                            return (
                              <li key={g.id}>
                                <button
                                  data-testid={`group-select-${g.id}`}
                                  className="w-full text-left p-3 border-b border-light flex justify-between items-center"
                                  style={{ background: isSelected ? 'var(--bg-sidebar-active)' : 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
                                  onClick={() => setSelectedGroupId(g.id)}
                                >
                                  <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{g.name}</span>
                                  <span className="badge badge-info">{memberCount}</span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                      <div className="p-3 border-t border-light mt-auto">
                        <div className="text-sm font-bold mb-2">새 그룹 추가</div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="이름 입력"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: 'var(--font-sm)' }}
                          />
                          <button 
                            className="btn btn-primary btn-sm"
                            onClick={createOrUpdateGroup}
                          >
                            추가
                          </button>
                        </div>
                        {groupActionError && <div className="text-error text-xs mt-1">{groupActionError}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-3 flex flex-col gap-4">
                  <div className="card">
                    <div className="card-header flex justify-between items-center">
                      <div>
                        <h3 className="card-title text-xl mb-1">
                          {selectedGroupId ? subscriberGroups.find(g => g.id === selectedGroupId)?.name || '알 수 없는 그룹' : '전체 구독자'}
                        </h3>
                        <div className="text-sm text-secondary">
                          {selectedGroupId ? '그룹에 속한 구독자 목록입니다.' : '모든 구독자 목록입니다. 발송 시에는 가급적 그룹을 지정해 주세요.'}
                        </div>
                      </div>
                      {selectedGroupId && (
                        <div className="flex gap-2">
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const g = subscriberGroups.find(g => g.id === selectedGroupId);
                              if (g) {
                                setEditingGroupId(g.id);
                                setGroupName(g.name);
                              }
                            }}
                          >
                            이름 수정
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              deleteGroup(selectedGroupId);
                              setSelectedGroupId(null);
                            }}
                          >
                            그룹 삭제
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="card-body p-0 border-b border-light flex p-4 gap-6 bg-gray-50" style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-light)', padding: '1rem', display: 'flex', gap: '1.5rem' }}>
                      {(() => {
                        const members = filteredSubscribers;
                        const total = members.length;
                        const eligible = members.filter(s => s.eligible && !s.isUnsubscribed).length;
                        const unsub = members.filter(s => s.isUnsubscribed).length;
                        const suppressed = members.filter(s => s.suppressionReasons.length > 0).length;
                        return (
                          <>
                            <div>
                              <div className="text-xs text-secondary mb-1">총 인원</div>
                              <div className="text-2xl font-bold">{total}</div>
                            </div>
                            <div>
                              <div className="text-xs text-secondary mb-1">발송 가능</div>
                              <div className="text-2xl font-bold text-success" style={{ color: 'var(--color-success)' }}>{eligible}</div>
                            </div>
                            <div>
                              <div className="text-xs text-secondary mb-1">수신 거부</div>
                              <div className="text-2xl font-bold text-warning" style={{ color: 'var(--color-warning)' }}>{unsub}</div>
                            </div>
                            <div>
                              <div className="text-xs text-secondary mb-1">발송 억제 (하드바운스 등)</div>
                              <div className="text-2xl font-bold text-error" style={{ color: 'var(--color-error)' }}>{suppressed}</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {subscriberActionError && (
                      <div className="p-4 text-error border-b border-light" style={{ color: 'var(--color-error)', padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>
                        {subscriberActionError}
                      </div>
                    )}

                    <div className="data-table-wrapper">
                      <table className="data-table" data-testid="subscriber-list">
                        <thead>
                          <tr>
                            <th>이메일 / 이름</th>
                            <th>상태</th>
                            <th>그룹</th>
                            <th>최근 동기화</th>
                            <th>액션</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isLoadingSubscribers ? (
                            <tr><td colSpan={5} className="text-center" style={{ padding: '2rem' }}>로딩 중...</td></tr>
                          ) : filteredSubscribers.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center" style={{ padding: '3rem' }}>
                                <div className="text-secondary mb-2">이 그룹에 속한 구독자가 없습니다.</div>
                                <button 
                                  className="btn btn-primary btn-sm"
                                  onClick={() => document.getElementById('add-subscriber-form')?.scrollIntoView({ behavior: 'smooth' })}
                                >
                                  구독자 추가하기
                                </button>
                              </td>
                            </tr>
                          ) : (
                            filteredSubscribers.map((s) => (
                              <tr key={s.id} data-testid={`subscriber-${s.email}`}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{s.email}</div>
                                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>{s.displayName || '-'}</div>
                                </td>
                                <td>
                                  <div className="flex gap-2">
                                    {s.eligible && !s.isUnsubscribed ? <span className="badge badge-success">발송 가능</span> : null}
                                    {s.isUnsubscribed ? <span className="badge badge-warning">수신 거부</span> : null}
                                    {s.suppressionReasons.length > 0 ? <span className="badge badge-error">억제됨 ({s.suppressionReasons.join(',')})</span> : null}
                                    {!s.eligible && !s.isUnsubscribed && s.suppressionReasons.length === 0 ? <span className="badge badge-neutral">{s.eligibilityReason || '불가'}</span> : null}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex gap-1 flex-wrap">
                                    {s.groups && s.groups.length > 0 ? s.groups.map(g => <span key={g.id} className="badge badge-info">{g.name}</span>) : '-'}
                                  </div>
                                </td>
                                <td>{s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString() : '없음'}</td>
                                <td>
                                  <div className="flex gap-2">
                                    <button className="btn btn-secondary btn-sm" onClick={() => void toggleSubscriberUnsubscribed(s)}>
                                      {s.isUnsubscribed ? '재구독 처리' : '수신거부 처리'}
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => void addHardBounceSuppression(s)}>하드바운스 처리</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => startEditingSubscriber(s)}>정보 수정</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => void deleteSubscriber(s.id)} type="button">삭제</button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
"""
parser = MyHTMLParser()
parser.feed(new_body)
print("div balance:", parser.divs)

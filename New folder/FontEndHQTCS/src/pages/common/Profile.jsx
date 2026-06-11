import { useEffect, useMemo, useState } from 'react'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import { getMe, updateMe, changePassword, getApiErrorMessage } from '../../api'

function getStoredUser() {
  return JSON.parse(localStorage.getItem('user') || 'null')
}

export default function Profile() {
  useSetPageHeader(
    'Thông tin cá nhân',
    'Xem, chỉnh sửa hồ sơ và thay đổi mật khẩu tài khoản của bạn',
  )

  const [user, setUser] = useState(() => getStoredUser())
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [profileMsg, setProfileMsg] = useState(null)
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser((prev) => ({ ...prev, ...me }))
        setProfileForm({
          name: me.name || me.fullName || '',
          email: me.email || '',
          phone: me.phone || '',
        })
      })
      .catch(() => {})
  }, [])

  const employeeId = useMemo(
    () => user?.employeeId || getStoredUser()?.employeeId,
    [user],
  )

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }))
  }

  const handlePasswordChange = (field, value) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileMsg(null)

    const name = profileForm.name.trim()
    const email = profileForm.email.trim()
    const phone = profileForm.phone.trim()
    if (!name || !email) {
      setProfileMsg({ type: 'error', text: 'Họ tên và email không được để trống.' })
      return
    }
    if (phone && !/^0\d{9}$/.test(phone)) {
      setProfileMsg({ type: 'error', text: 'Số điện thoại phải có dạng 0xxxxxxxxx (10 số).' })
      return
    }

    setSavingProfile(true)
    try {
      const updatedUser = await updateMe({
        fullName: name,
        email,
        phone,
      })

      localStorage.setItem('user', JSON.stringify(updatedUser))
      window.dispatchEvent(new Event('user-updated'))
      setUser(updatedUser)
      setProfileForm({
        name: updatedUser.name || updatedUser.fullName || name,
        email: updatedUser.email || email,
        phone: updatedUser.phone || phone,
      })
      setProfileMsg({ type: 'success', text: 'Đã cập nhật hồ sơ thành công.' })
    } catch (error) {
      setProfileMsg({ type: 'error', text: getApiErrorMessage(error, 'Không thể cập nhật hồ sơ') })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordMsg(null)

    const { currentPassword, newPassword, confirmPassword } = passwordForm
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ các trường mật khẩu.' })
      return
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Mật khẩu nhập lại không khớp.' })
      return
    }
    if (!employeeId) {
      setPasswordMsg({ type: 'error', text: 'Không xác định được mã nhân viên.' })
      return
    }

    try {
      await changePassword(employeeId, {
        currentPassword,
        newPassword,
      })
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setPasswordMsg({ type: 'success', text: 'Đã đổi mật khẩu thành công.' })
    } catch (error) {
      setPasswordMsg({ type: 'error', text: getApiErrorMessage(error, 'Không thể đổi mật khẩu') })
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <div className="mb-6 flex gap-2 border-b border-slate-100 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              activeTab === 'profile' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Hồ sơ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              activeTab === 'password' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Mật khẩu
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Họ tên</label>
              <input
                value={profileForm.name}
                onChange={(e) => handleProfileChange('name', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input
                value={profileForm.email}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Số điện thoại</label>
              <input
                value={profileForm.phone}
                onChange={(e) => handleProfileChange('phone', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
            </div>
            {profileMsg && (
              <p className={`text-sm ${profileMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {profileMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-70"
            >
              {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu hiện tại</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu mới</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Nhập lại mật khẩu mới</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
            </div>
            {passwordMsg && (
              <p className={`text-sm ${passwordMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {passwordMsg.text}
              </p>
            )}
            <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              Đổi mật khẩu
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

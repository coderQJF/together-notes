<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'

type LegalDocument = 'terms' | 'privacy'

const document = ref<LegalDocument>('privacy')
const title = computed(() => document.value === 'terms' ? '用户协议' : '隐私政策')

onLoad(options => {
  document.value = options?.document === 'terms' ? 'terms' : 'privacy'
})
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="title" />
    <view class="document">
      <text class="headline">{{ title }}</text>
      <text class="updated">更新日期：2026 年 9 月 23 日</text>

      <template v-if="document === 'terms'">
        <view class="section"><text class="section-title">1. 服务说明</text><text>“小记”提供随记、提醒、双人共享、附件、资讯、搜索和本地文本阅读等功能。内测期间功能可能调整或暂时中断，请勿把本服务作为医疗、财务、安全等关键事项的唯一提醒方式。</text></view>
        <view class="section"><text class="section-title">2. 账号安全</text><text>请使用本人保管的账号和密码，不要向他人透露密码。因主动共享邀请码、账号或设备产生的访问风险，由用户自行承担；发现异常时请及时修改使用方式或联系维护者。</text></view>
        <view class="section"><text class="section-title">3. 内容与共享</text><text>私人内容仅账号本人可访问。标记为“我们俩”的内容会向已绑定的另一方开放查看和编辑，创建者仍负责删除和可见范围。导入书架的文本仅用于本机阅读；请只导入自己创作、已获授权或已进入公版领域的内容，并确保上传、记录和分享的其他内容合法且拥有必要权利。</text></view>
        <view class="section"><text class="section-title">4. 外部信息</text><text>赛事、新闻和模型回答可能来自第三方数据源，仅用于信息参考，不构成投资、医疗或其他专业建议。第三方信息可能延迟、不完整或发生变化。</text></view>
        <view class="section"><text class="section-title">5. 内测说明</text><text>这是非公开内测版本。维护者会尽力保护数据和保持服务可用，但不承诺服务永久连续。重要内容请自行保留副本。</text></view>
        <view class="section"><text class="section-title">6. 终止使用</text><text>你可以退出登录或在“小空间”中注销账号。注销后，账号及本人创建的数据将按页面提示删除且不可恢复。</text></view>
      </template>

      <template v-else>
        <view class="section"><text class="section-title">1. 我们处理的信息</text><text>注册时处理账号、加盐后的密码摘要和昵称；使用过程中处理你主动创建的随记、提醒、共享关系、附件，以及维持登录所需的会话信息。你主动开启 Stock Platform 联动时，我们只保存手机号的不可逆摘要和末四位，不保存完整手机号，也不会向 Stock Platform 返回你的账号资料。你导入书架的书名、作者、正文、阅读进度和显示设置仅保存在当前设备，不会上传到业务服务器。密码原文不会保存到服务器。</text></view>
        <view class="section"><text class="section-title">2. 使用目的</text><text>这些信息用于登录鉴权、保存和同步内容、向绑定对象展示共享内容、生成站内提醒、按手机号摘要匹配并接收你主动开启的 Stock Platform 观察清单、提供搜索结果以及保障服务安全。私人小记不会被发送给联网模型用于搜索。</text></view>
        <view class="section"><text class="section-title">3. 权限与设备能力</text><text>在 App 中选择图片附件时，系统可能请求照片访问权限；导入 TXT 时会打开 Android 系统文件选择器，并只读取你主动选中的文件，不申请访问全部存储空间。本版本不会请求相机权限。启用本机提醒时会请求通知权限，并使用 Android 的闹钟与开机恢复能力。只有你主动使用对应功能时才会申请；拒绝不会影响其他基础功能，但划掉 App 后可能无法按时弹出提醒。</text></view>
        <view class="section"><text class="section-title">4. App 运行框架</text><text>本产品基于 DCloud uni-app（5+ App）开发。App 运行期间，DCloud App 引擎可能处理设备标识、应用启动数据和异常错误日志，以保障基础运行并分析性能。详情可查看 DCloud App 引擎隐私政策。</text></view>
        <view class="section"><text class="section-title">5. 本机系统提醒</text><text>App 会把已经同步且提醒对象包含你的提醒标题、内容、时间、重复规则和打开目标保存在当前 Android 设备，用于在 App 被划掉或进程被系统回收后创建通知。相关数据不会发送给 UniPush、个推或 uniCloud。对方在你离线期间新建或修改的提醒，需要你再次打开 App 完成同步后才能登记到本机。退出登录、注销账号或删除提醒时，会同步清理对应的本机计划；在系统设置中“强行停止”App 后，Android 可能取消后续提醒。</text></view>
        <view class="section"><text class="section-title">6. 桌面服务卡片</text><text>你主动添加桌面服务卡片后，App 会把已同步的小记标题、正文摘要、更新时间和所选小记 ID 缓存在当前 Android 设备，用于在华为桌面显示卡片。桌面上的内容可能被能查看或操作本设备的人看到；这些缓存不会发送给新的第三方服务，退出登录或注销账号时会清理。</text></view>
        <view class="section"><text class="section-title">7. 其他第三方服务</text><text>联网搜索、赛事、资讯和图片缓存可能调用页面中标明的第三方服务。请求仅包含实现功能所需的信息；账号密码和私人小记不会提供给内容数据源。</text></view>
        <view class="section"><text class="section-title">8. 保存与保护</text><text>业务数据保存在本服务配置的服务器和备份中，通过 HTTPS 传输并按账号权限隔离。我们会采取合理安全措施，但互联网服务无法保证绝对安全。</text></view>
        <view class="section"><text class="section-title">9. 共享与删除</text><text>只有你主动选择“我们俩”时，绑定对象才能访问相应内容。你可以删除单条内容，也可以在“小空间”中注销账号；账号注销会解除双人绑定并删除本人账号和本人创建的服务端数据。本地书架不随账号同步，需在书架中单独删除，卸载 App 也可能清除它。</text></view>
        <view class="section"><text class="section-title">10. 联系与变更</text><text>内测问题请联系向你提供安装包的维护者。政策发生实质变化时，将在后续版本中更新日期和说明。</text></view>
      </template>
    </view>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.document{padding-bottom:20px}.headline{display:block;margin:4px 0 6px;font-size:31px;font-weight:600;line-height:1.35;letter-spacing:-.6px}.updated{display:block;margin-bottom:28px;color:#8b806e;font-size:11px}.section{padding:19px 18px;margin:12px 0;border:1px solid #ece5d6;border-radius:18px;background:#fff;color:#62594b;font-size:14px;line-height:1.85}.section-title{display:block;margin-bottom:8px;color:#494032;font-size:16px;font-weight:600}.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}.headline{font-size:29px}.section{padding:17px 16px}}
</style>

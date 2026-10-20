<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
// Preserve previously sent links without showing an intermediate invitation page.
onLoad(()=>uni.redirectTo({url:'/pages/water/water',fail:()=>uni.reLaunch({url:'/pages/water/water'})}))
</script>
<template><view /></template>

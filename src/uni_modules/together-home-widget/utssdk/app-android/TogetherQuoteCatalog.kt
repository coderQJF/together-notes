package uts.sdk.modules.togetherHomeWidget

internal data class TogetherWidgetQuote(
    val text: String,
    val author: String,
)

/** Local, dependency-free content for the desktop-only 句读 widget mode. */
internal object TogetherQuoteCatalog {
    private val quotes = listOf(
        TogetherWidgetQuote("知之者不如好之者，好之者不如乐之者。", "孔子"),
        TogetherWidgetQuote("三人行，必有我师焉。", "孔子"),
        TogetherWidgetQuote("学而不思则罔，思而不学则殆。", "孔子"),
        TogetherWidgetQuote("温故而知新，可以为师矣。", "孔子"),
        TogetherWidgetQuote("逝者如斯夫，不舍昼夜。", "孔子"),
        TogetherWidgetQuote("千里之行，始于足下。", "老子"),
        TogetherWidgetQuote("天下难事，必作于易；天下大事，必作于细。", "老子"),
        TogetherWidgetQuote("知人者智，自知者明。", "老子"),
        TogetherWidgetQuote("胜人者有力，自胜者强。", "老子"),
        TogetherWidgetQuote("不积跬步，无以至千里；不积小流，无以成江海。", "荀子"),
        TogetherWidgetQuote("锲而不舍，金石可镂。", "荀子"),
        TogetherWidgetQuote("天行健，君子以自强不息。", "《周易》"),
        TogetherWidgetQuote("地势坤，君子以厚德载物。", "《周易》"),
        TogetherWidgetQuote("苟日新，日日新，又日新。", "《礼记》"),
        TogetherWidgetQuote("博学之，审问之，慎思之，明辨之，笃行之。", "《礼记》"),
        TogetherWidgetQuote("路漫漫其修远兮，吾将上下而求索。", "屈原"),
        TogetherWidgetQuote("亦余心之所善兮，虽九死其犹未悔。", "屈原"),
        TogetherWidgetQuote("长风破浪会有时，直挂云帆济沧海。", "李白"),
        TogetherWidgetQuote("天生我材必有用，千金散尽还复来。", "李白"),
        TogetherWidgetQuote("会当凌绝顶，一览众山小。", "杜甫"),
        TogetherWidgetQuote("读书破万卷，下笔如有神。", "杜甫"),
        TogetherWidgetQuote("纸上得来终觉浅，绝知此事要躬行。", "陆游"),
        TogetherWidgetQuote("山重水复疑无路，柳暗花明又一村。", "陆游"),
        TogetherWidgetQuote("问渠那得清如许？为有源头活水来。", "朱熹"),
        TogetherWidgetQuote("等闲识得东风面，万紫千红总是春。", "朱熹"),
        TogetherWidgetQuote("不畏浮云遮望眼，自缘身在最高层。", "王安石"),
        TogetherWidgetQuote("看似寻常最奇崛，成如容易却艰辛。", "王安石"),
        TogetherWidgetQuote("业精于勤，荒于嬉；行成于思，毁于随。", "韩愈"),
        TogetherWidgetQuote("沉舟侧畔千帆过，病树前头万木春。", "刘禹锡"),
        TogetherWidgetQuote("欲穷千里目，更上一层楼。", "王之涣"),
        TogetherWidgetQuote("海内存知己，天涯若比邻。", "王勃"),
        TogetherWidgetQuote("莫愁前路无知己，天下谁人不识君。", "高适"),
        TogetherWidgetQuote("大鹏一日同风起，扶摇直上九万里。", "李白"),
        TogetherWidgetQuote("但愿人长久，千里共婵娟。", "苏轼"),
        TogetherWidgetQuote("竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。", "苏轼"),
        TogetherWidgetQuote("不识庐山真面目，只缘身在此山中。", "苏轼"),
        TogetherWidgetQuote("生当作人杰，死亦为鬼雄。", "李清照"),
        TogetherWidgetQuote("两情若是久长时，又岂在朝朝暮暮。", "秦观"),
        TogetherWidgetQuote("落红不是无情物，化作春泥更护花。", "龚自珍"),
        TogetherWidgetQuote("我劝天公重抖擞，不拘一格降人才。", "龚自珍"),
        TogetherWidgetQuote("非淡泊无以明志，非宁静无以致远。", "诸葛亮《诫子书》"),
        TogetherWidgetQuote("一寸光阴一寸金，寸金难买寸光阴。", "《增广贤文》"),
        TogetherWidgetQuote("吾生也有涯，而知也无涯。", "庄子"),
        TogetherWidgetQuote("人生天地之间，若白驹之过隙，忽然而已。", "庄子"),
        TogetherWidgetQuote("鹏之徙于南冥也，水击三千里。", "庄子"),
        TogetherWidgetQuote("穷则独善其身，达则兼善天下。", "《孟子》"),
        TogetherWidgetQuote("故天将降大任于是人也，必先苦其心志，劳其筋骨。", "《孟子》"),
        TogetherWidgetQuote("富贵不能淫，贫贱不能移，威武不能屈。", "《孟子》"),
    )

    val size: Int get() = quotes.size

    fun quoteAt(index: Int): TogetherWidgetQuote = quotes[index.coerceIn(0, quotes.lastIndex)]
}
